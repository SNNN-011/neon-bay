// Neon Bay — traffic AI: right-hand lanes, signalized intersections with
// turn decisions, lookahead braking, and a spawn/despawn pool that follows
// the player. Mission vans (missionCar) run reds and never despawn.

import { CONFIG } from './config.js';
import { clamp, mulberry32, randRange, randInt, pick } from './util.js';
import { updateVehiclePhysics, randomCarType } from './vehicles.js';

const T = CONFIG.traffic;
const C = CONFIG.city;

// Cardinal directions: 0=N(-z) 1=S(+z) 2=E(+x) 3=W(-x).
const DIRS = [{ dx: 0, dz: -1 }, { dx: 0, dz: 1 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }];
const RIGHT_TURN = [2, 3, 1, 0];
const LEFT_TURN = [3, 2, 0, 1];
const dirYaw = (d) => Math.atan2(DIRS[d].dx, DIRS[d].dz);
// Right-hand traffic: lane sits 3m to the right of the centerline.
const laneOffset = (d) => (DIRS[d].dx !== 0 ? DIRS[d].dx * 3 : -DIRS[d].dz * 3);

export function createTraffic(vehicles, city, rngSeed) {
  const seed = rngSeed || 777;
  let rng = mulberry32(seed);
  const lines = city.roads.lines;

  function initAI(v, dir, road, cruise) {
    v.ai = { dir, road, cruise, turn: null, wp: null };
    v.yaw = dirYaw(dir);
  }

  // Next cross-street ahead of `coord` along the travel direction.
  function nextIntersection(coord, dir) {
    const sign = DIRS[dir].dx || DIRS[dir].dz;
    let best = null, bestD = Infinity;
    for (const l of lines) {
      const ahead = (l - coord) * sign;
      if (ahead > 0.5 && ahead < bestD) { bestD = ahead; best = l; }
    }
    return best;
  }

  // NS green on even phases, EW on odd — purely a function of sim time.
  function isGreen(dir, time) {
    const phase = Math.floor(time / T.greenPeriod) % 2;
    const ns = DIRS[dir].dx === 0;
    return ns ? phase === 0 : phase === 1;
  }

  function spawnAround(focus) {
    const dir = randInt(rng, 0, 3);
    const road = pick(rng, lines);
    const horizontal = DIRS[dir].dx !== 0;
    const lane = road + laneOffset(dir);
    const along = clamp(
      (horizontal ? focus.x : focus.z) + (rng() < 0.5 ? -1 : 1) * randRange(rng, T.spawnMin, T.spawnMax),
      -C.cityEdge + 6, C.cityEdge - 6
    );
    const x = horizontal ? along : lane;
    const z = horizontal ? lane : along;
    // Keep spawn points clear of existing cars and not too close to focus.
    for (const c of vehicles.list) if (Math.hypot(c.x - x, c.z - z) < 12) return false;
    if (Math.hypot(focus.x - x, focus.z - z) < T.spawnMin - 10) return false;
    const v = vehicles.spawn({
      type: randomCarType(rng),
      color: pick(rng, CONFIG.palette.cars),
      x, z, yaw: dirYaw(dir), kind: 'traffic',
    });
    if (!v) return false;
    initAI(v, dir, road, randRange(rng, T.cruiseMin, T.cruiseMax));
    return true;
  }

  function update(dt, ctx) {
    const { state, player, peds, time } = ctx;
    const focus = state.mode === 'driving' && vehicles.playerCar ? vehicles.playerCar : player.pos;

    // Recycle distant cars, then top the pool back up near the focus.
    for (let i = vehicles.list.length - 1; i >= 0; i--) {
      const v = vehicles.list[i];
      if (v.kind === 'traffic' && !v.missionCar && Math.hypot(v.x - focus.x, v.z - focus.z) > T.despawn) vehicles.despawn(v);
    }
    let count = 0;
    for (const v of vehicles.list) if (v.kind === 'traffic') count++;
    for (let a = 0; a < 10 && count < T.count; a++) if (spawnAround(focus)) count++;

    for (const v of vehicles.list) {
      if (v.kind !== 'traffic' || !v.ai) continue;
      if (v.stun > 0) {
        // Wrecked/stunned: coast to a stop, then rejoin the lane ahead.
        v.stun = Math.max(0, v.stun - dt);
        updateVehiclePhysics(v, dt, { throttle: 0, steer: 0 }, city);
        if (v.stun === 0) { v.ai.turn = null; v.ai.wp = null; }
        continue;
      }
      const ai = v.ai;
      const d = DIRS[ai.dir];
      const horizontal = d.dx !== 0;
      const sign = d.dx || d.dz;
      const coord = horizontal ? v.x : v.z;
      const lane = ai.road + laneOffset(ai.dir);
      const nextI = nextIntersection(coord, ai.dir);

      // Cruise default: a lookahead waypoint keeps the car lane-centered.
      let targetSpeed = ai.cruise;
      let wp = horizontal
        ? { x: coord + d.dx * 12, z: lane }
        : { x: lane, z: coord + d.dz * 12 };

      if (nextI !== null) {
        const stopCoord = nextI - sign * 9;
        const distToStop = (stopCoord - coord) * sign;
        if (distToStop > -2 && distToStop < 28) {
          const ix = horizontal ? nextI : ai.road;
          const iz = horizontal ? ai.road : nextI;
          let clear = v.missionCar || isGreen(ai.dir, time); // fleeing mission van runs reds
          if (clear) {
            // Don't enter a box already occupied by cross-direction traffic.
            for (const c of vehicles.list) {
              if (c === v || !c.active) continue;
              if (Math.abs(c.x - ix) < 8 && Math.abs(c.z - iz) < 8) {
                const cd = c.ai ? DIRS[c.ai.dir] : null;
                if (!cd || (cd.dx !== 0) !== horizontal) { clear = false; break; }
              }
            }
          }
          const stopWp = horizontal ? { x: stopCoord, z: lane } : { x: lane, z: stopCoord };
          if (!clear) {
            targetSpeed = 0;
            wp = stopWp;
            ai.turn = null;
          } else {
            if (!ai.turn && distToStop < 6) {
              const r = rng();
              ai.turn = r < 0.5 ? 'straight' : r < 0.75 ? 'right' : 'left';
            }
            if (ai.turn) {
              targetSpeed = Math.min(ai.cruise, 6.5);
              if (ai.turn === 'straight') {
                wp = horizontal ? { x: nextI + d.dx * 11, z: lane } : { x: lane, z: nextI + d.dz * 11 };
                if ((coord - nextI) * sign > 10) ai.turn = null;
              } else {
                const newDir = ai.turn === 'right' ? RIGHT_TURN[ai.dir] : LEFT_TURN[ai.dir];
                const nd = DIRS[newDir];
                // Corner where the old lane meets the new lane.
                const cx = ix + (horizontal ? 0 : laneOffset(ai.dir)) + (nd.dx !== 0 ? 0 : laneOffset(newDir));
                const cz = iz + (horizontal ? laneOffset(ai.dir) : 0) + (nd.dx !== 0 ? laneOffset(newDir) : 0);
                wp = { x: cx, z: cz };
                if (Math.hypot(v.x - cx, v.z - cz) < 2.2) {
                  ai.dir = newDir;
                  ai.road = horizontal ? ix : iz;
                  ai.turn = null;
                }
              }
            }
          }
        }
      }

      // Brake for anything in the lookahead zone: cars, Riko, pedestrians.
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const px = v.x + fx * 7.5, pz = v.z + fz * 7.5;
      for (const c of vehicles.list) {
        if (c !== v && c.active && Math.hypot(c.x - px, c.z - pz) < 3.6) { targetSpeed = 0; break; }
      }
      if (state.mode === 'onfoot' && Math.hypot(player.pos.x - px, player.pos.z - pz) < 5) targetSpeed = 0;
      if (peds) {
        for (const p of peds.list) {
          if (p.active && Math.hypot(p.x - px, p.z - pz) < 4.5) { targetSpeed = 0; break; }
        }
      }

      // Pure-pursuit steer toward the waypoint, P-control on speed.
      const dx = wp.x - v.x, dz = wp.z - v.z;
      let diff = (Math.atan2(dx, dz) - v.yaw) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      const steer = clamp(diff * 2.5, -1, 1);
      const fwd = v.vx * fx + v.vz * fz;
      const throttle = clamp((targetSpeed - fwd) * 0.5, -1, 1);
      updateVehiclePhysics(v, dt, { throttle, steer, handbrake: false }, city);
    }
  }

  function reset() {
    for (let i = vehicles.list.length - 1; i >= 0; i--) {
      if (vehicles.list[i].kind === 'traffic') vehicles.despawn(vehicles.list[i]);
    }
    rng = mulberry32(seed);
  }

  return { update, reset, cars: () => vehicles.list.filter((v) => v.kind === 'traffic') };
}
