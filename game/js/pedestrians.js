// Neon Bay — pedestrians: low-poly townsfolk who stroll the sidewalk rings
// around each block, pause at corners, and flee from fast cars (or anything
// combat triggers via triggerFlee). Rendered as six InstancedMeshes with a
// procedural walk cycle; spawn/despawn keeps ~20 active around the player.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, mulberry32, randRange, randInt, pick, resolveCircleVsBoxes } from './util.js';
import { carCircles } from './vehicles.js';

const P = CONFIG.peds;
const SIDEWALK_R = 12.5; // walking band around each 28m block plinth
const MAX = 26;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const SKIN = [0xe8b48c, 0xc98d5e, 0x8a5a3b, 0xf0c9a0];
const SHIRTS = [0xff8fb3, 0x7fd8c9, 0xffd98a, 0x9fb4ff, 0xff9e6b, 0xe8e4da, 0x6bd5ff, 0x3dff8f, 0xff5f9e];
const PANTS = [0x35304f, 0x4a4556, 0x2f4858, 0x6b5b4a, 0x524a6b];

export function createPedestrians(scene, city, rngSeed) {
  const seed = rngSeed || 4242;
  let rng = mulberry32(seed);
  const list = [];
  const freeSlots = [];
  for (let i = MAX - 1; i >= 0; i--) freeSlots.push(i);

  const unit = new THREE.BoxGeometry(1, 1, 1);
  const legGeo = new THREE.BoxGeometry(0.16, 0.72, 0.18);
  legGeo.translate(0, -0.36, 0); // pivot at the hip
  const armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.14);
  armGeo.translate(0, -0.25, 0); // pivot at the shoulder
  const torsos = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX);
  const heads = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.75 }), MAX);
  const legs = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAX * 2);
  const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX * 2);
  const meshes = [torsos, heads, legs, arms];
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const m of meshes) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    scene.add(m);
    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, zero);
  }

  // Corners of a block's sidewalk ring, clockwise.
  function corners(cx, cz) {
    return [
      { x: cx - SIDEWALK_R, z: cz - SIDEWALK_R },
      { x: cx + SIDEWALK_R, z: cz - SIDEWALK_R },
      { x: cx + SIDEWALK_R, z: cz + SIDEWALK_R },
      { x: cx - SIDEWALK_R, z: cz + SIDEWALK_R },
    ];
  }

  function spawn(focus) {
    if (!freeSlots.length) return false;
    const centers = city.cellCenters;
    const cx = pick(rng, centers), cz = pick(rng, centers);
    if (Math.hypot(cx - focus.x, cz - focus.z) > P.spawnRadius) return false;
    const cs = corners(cx, cz);
    const ci = randInt(rng, 0, 3);
    const a = cs[ci], b = cs[(ci + 1) % 4];
    const t = rng();
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (const p of list) if (Math.hypot(p.x - x, p.z - z) < 2.5) return false;
    const p = {
      x, z, y: city.groundHeightAt(x, z),
      yaw: 0, phase: randRange(rng, 0, 6),
      speed: randRange(rng, P.walkMin, P.walkMax),
      cx, cz, ci, cw: rng() < 0.5 ? 1 : -1,
      pause: 0, flee: 0, fleeX: 0, fleeZ: 0,
      kx: 0, kz: 0,
      slot: freeSlots.pop(),
      active: true,
    };
    list.push(p);
    torsos.setColorAt(p.slot, tmpColor.setHex(pick(rng, SHIRTS)));
    heads.setColorAt(p.slot, tmpColor.setHex(pick(rng, SKIN)));
    const pant = pick(rng, PANTS);
    legs.setColorAt(p.slot * 2, tmpColor.setHex(pant));
    legs.setColorAt(p.slot * 2 + 1, tmpColor.setHex(pant));
    const sleeve = pick(rng, SHIRTS);
    arms.setColorAt(p.slot * 2, tmpColor.setHex(sleeve));
    arms.setColorAt(p.slot * 2 + 1, tmpColor.setHex(sleeve));
    for (const m of meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return true;
  }

  function despawn(p) {
    p.active = false;
    list.splice(list.indexOf(p), 1);
    freeSlots.push(p.slot);
    torsos.setMatrixAt(p.slot, zero);
    heads.setMatrixAt(p.slot, zero);
    legs.setMatrixAt(p.slot * 2, zero);
    legs.setMatrixAt(p.slot * 2 + 1, zero);
    arms.setMatrixAt(p.slot * 2, zero);
    arms.setMatrixAt(p.slot * 2 + 1, zero);
  }

  // Combat / explosions call this to scatter everyone in a radius.
  function triggerFlee(x, z, radius, duration = 4) {
    for (const p of list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > radius) continue;
      startFlee(p, p.x - x, p.z - z, duration);
    }
  }

  function startFlee(p, ax, az, duration) {
    const d = Math.hypot(ax, az) || 1;
    // Run away from the threat with a slight sideways jink.
    const jink = (rng() - 0.5) * 0.9;
    p.fleeX = ax / d + (-az / d) * jink;
    p.fleeZ = az / d + (ax / d) * jink;
    const n = Math.hypot(p.fleeX, p.fleeZ) || 1;
    p.fleeX /= n; p.fleeZ /= n;
    p.flee = Math.max(p.flee, duration);
  }

  function update(dt, ctx) {
    const { state, player, vehicles } = ctx;
    const focus = state.mode === 'driving' && vehicles.playerCar ? vehicles.playerCar : player.pos;

    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (Math.hypot(p.x - focus.x, p.z - focus.z) > P.despawn) despawn(p);
    }
    for (let a = 0; a < 6 && list.length < P.count; a++) spawn(focus);

    for (const p of list) {
      // Fear: fast approaching cars set off a flee response.
      for (const v of vehicles.list) {
        if (!v.active) continue;
        const cs = Math.hypot(v.vx, v.vz);
        if (cs < 7) continue;
        const dx = p.x - v.x, dz = p.z - v.z;
        const d = Math.hypot(dx, dz);
        if (d < 9 && (v.vx * dx + v.vz * dz) / (d || 1) > cs * 0.4) {
          startFlee(p, dx, dz, 3);
          break;
        }
        for (const c of carCircles(v)) {
          const cd = Math.hypot(p.x - c.x, p.z - c.z);
          if (cd < c.r + 0.35 && cs > 3) {
            // Clipped by a car: shove and scatter.
            const n = cd || 1;
            p.kx += ((p.x - c.x) / n) * 5 + v.vx * 0.5;
            p.kz += ((p.z - c.z) / n) * 5 + v.vz * 0.5;
            startFlee(p, dx, dz, 5);
            break;
          }
        }
      }

      let mx = 0, mz = 0, spd = 0;
      if (p.flee > 0) {
        p.flee -= dt;
        mx = p.fleeX; mz = p.fleeZ; spd = P.fleeSpeed;
        if (p.flee <= 0) {
          // Rejoin the nearest sidewalk corner.
          let best = null, bestD = Infinity, bcx = 0, bcz = 0, bci = 0;
          for (const cx of city.cellCenters) for (const cz of city.cellCenters) {
            const cs = corners(cx, cz);
            for (let k = 0; k < 4; k++) {
              const d = Math.hypot(p.x - cs[k].x, p.z - cs[k].z);
              if (d < bestD) { bestD = d; best = cs[k]; bcx = cx; bcz = cz; bci = k; }
            }
          }
          p.cx = bcx; p.cz = bcz; p.ci = bci;
          p.rejoin = best;
        }
      } else if (p.rejoin) {
        const dx = p.rejoin.x - p.x, dz = p.rejoin.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) { p.rejoin = null; }
        else { mx = dx / d; mz = dz / d; spd = p.speed * 1.6; }
      } else if (p.pause > 0) {
        p.pause -= dt;
      } else {
        const cs = corners(p.cx, p.cz);
        const target = cs[(p.ci + p.cw + 4) % 4];
        const dx = target.x - p.x, dz = target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) {
          p.ci = (p.ci + p.cw + 4) % 4;
          if (rng() < 0.25) p.pause = randRange(rng, 0.5, 2.2);
          if (rng() < 0.15) p.cw = -p.cw;
        } else { mx = dx / d; mz = dz / d; spd = p.speed; }
      }

      // Knockback impulse decays quickly.
      p.x += (mx * spd + p.kx) * dt;
      p.z += (mz * spd + p.kz) * dt;
      p.kx *= Math.exp(-5 * dt);
      p.kz *= Math.exp(-5 * dt);
      const pos = { x: p.x, z: p.z };
      if (resolveCircleVsBoxes(pos, 0.32, city.colliders)) {
        // Blocked while fleeing: turn along the obstacle.
        if (p.flee > 0) {
          const t = p.fleeX;
          p.fleeX = -p.fleeZ; p.fleeZ = t;
        }
        p.x = pos.x; p.z = pos.z;
      }
      city.clampToWorld(p);
      p.y = city.groundHeightAt(p.x, p.z);
      if (mx || mz) p.yaw = Math.atan2(mx, mz);
      p.phase += (spd > 0 ? spd * 3.1 : 0) * dt;
    }
    syncInstances();
  }

  function setPart(mesh, slot, p, lx, ly, lz, sx, sy, sz, pitch) {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    dummy.position.set(p.x + lx * c + lz * s, p.y + ly, p.z - lx * s + lz * c);
    dummy.rotation.order = 'YXZ';
    dummy.rotation.set(pitch || 0, p.yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
  }

  function syncInstances() {
    for (const p of list) {
      const swing = Math.sin(p.phase) * (p.flee > 0 ? 0.85 : 0.5);
      setPart(torsos, p.slot, p, 0, 1.06, 0, 0.42, 0.56, 0.26, 0);
      setPart(heads, p.slot, p, 0, 1.52, 0, 0.28, 0.3, 0.28, 0);
      setPart(legs, p.slot * 2, p, -0.1, 0.78, 0, 1, 1, 1, swing);
      setPart(legs, p.slot * 2 + 1, p, 0.1, 0.78, 0, 1, 1, 1, -swing);
      setPart(arms, p.slot * 2, p, -0.28, 1.32, 0, 1, 1, 1, -swing * 0.8);
      setPart(arms, p.slot * 2 + 1, p, 0.28, 1.32, 0, 1, 1, 1, swing * 0.8);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  function reset() {
    for (let i = list.length - 1; i >= 0; i--) despawn(list[i]);
    rng = mulberry32(seed);
  }

  return { update, triggerFlee, reset, list };
}