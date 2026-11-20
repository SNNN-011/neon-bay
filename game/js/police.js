// Neon Bay — Neon Bay PD: pooled patrol cars that chase and ram, and foot
// officers that pursue and shoot when Riko is on foot. Cars spawn only in the
// "hot" window after a crime; out of sight they search the last known spot.
// Close + sustained contact on foot = capture -> BUSTED (handled by combat).

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, mulberry32, randRange, pick, resolveCircleVsBoxes, segmentBlocked } from './util.js';
import { updateVehiclePhysics } from './vehicles.js';

const PL = CONFIG.police;
const MAXC = 6, MAXF = 6;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);
const TAU = Math.PI * 2;

export function createPolice(scene, city, vehicles, peds, effects) {
  const rng = mulberry32(31337);
  const tall = city.colliders.filter((b) => b.height > 3);
  const cars = [];
  const foot = [];
  const freeF = [];
  for (let i = MAXF - 1; i >= 0; i--) freeF.push(i);

  // One instanced lightbar for the whole fleet (flashes red/blue).
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bar = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial(), MAXC);
  // Foot officers: four instanced parts, same trick as the pedestrians.
  const legGeo = new THREE.BoxGeometry(0.17, 0.74, 0.19);
  legGeo.translate(0, -0.37, 0);
  const armGeo = new THREE.BoxGeometry(0.13, 0.52, 0.15);
  armGeo.translate(0, -0.26, 0);
  const torsos = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXF);
  const heads = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.75 }), MAXF);
  const caps = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0x1f2a4a, roughness: 0.7 }), MAXF);
  const legs = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAXF * 2);
  const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAXF * 2);
  const meshes = [bar, torsos, heads, caps, legs, arms];
  for (const m of meshes) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = m !== bar;
    scene.add(m);
    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, zero);
  }

  const sys = { cars, foot, seesPlayer: false, capture: 0 };

  function spawnCar(focus) {
    const lines = city.roads.lines;
    for (let a = 0; a < 8; a++) {
      const vertical = rng() < 0.5;
      const road = pick(rng, lines);
      const along = clamp((vertical ? focus.z : focus.x) + (rng() < 0.5 ? -1 : 1) * randRange(rng, PL.spawnMin, PL.spawnMax), -126, 126);
      const lane = road + (rng() < 0.5 ? -3 : 3);
      const x = vertical ? lane : along;
      const z = vertical ? along : lane;
      if (Math.hypot(x - focus.x, z - focus.z) < 35) continue;
      let clear = true;
      for (const c of vehicles.list) if (Math.hypot(c.x - x, c.z - z) < 10) { clear = false; break; }
      if (!clear) continue;
      const v = vehicles.spawn({ type: 'sedan', color: 0xeef1f6, x, z, yaw: Math.atan2(focus.x - x, focus.z - z), kind: 'police' });
      if (!v) return;
      v.hp = CONFIG.combat.carHp;
      v.cd = 0;
      v.tx = focus.x; v.tz = focus.z;
      cars.push(v);
      return;
    }
  }

  function spawnFoot(focus) {
    if (!freeF.length) return;
    for (let a = 0; a < 8; a++) {
      const ang = rng() * TAU, d = randRange(rng, 16, 28);
      const pos = { x: focus.x + Math.sin(ang) * d, z: focus.z + Math.cos(ang) * d };
      resolveCircleVsBoxes(pos, 0.4, city.colliders);
      city.clampToWorld(pos);
      if (Math.hypot(pos.x - focus.x, pos.z - focus.z) < 10) continue;
      const c = {
        x: pos.x, z: pos.z, y: city.groundHeightAt(pos.x, pos.z),
        yaw: 0, hp: CONFIG.combat.copHp, shoot: randRange(rng, 0.6, 1.6),
        phase: 0, slot: freeF.pop(), active: true, tx: focus.x, tz: focus.z,
      };
      foot.push(c);
      torsos.setColorAt(c.slot, tmpColor.setHex(0x2c3e6b));
      heads.setColorAt(c.slot, tmpColor.setHex(0xe8b48c));
      legs.setColorAt(c.slot * 2, tmpColor.setHex(0x232c4d));
      legs.setColorAt(c.slot * 2 + 1, tmpColor.setHex(0x232c4d));
      arms.setColorAt(c.slot * 2, tmpColor.setHex(0x2c3e6b));
      arms.setColorAt(c.slot * 2 + 1, tmpColor.setHex(0x2c3e6b));
      for (const m of [torsos, heads, legs, arms]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
      return;
    }
  }

  function despawnCar(v) {
    const i = cars.indexOf(v);
    if (i >= 0) cars.splice(i, 1);
    if (v.active) vehicles.despawn(v);
  }
  function despawnFoot(c) {
    c.active = false;
    const i = foot.indexOf(c);
    if (i >= 0) foot.splice(i, 1);
    freeF.push(c.slot);
    torsos.setMatrixAt(c.slot, zero);
    heads.setMatrixAt(c.slot, zero);
    caps.setMatrixAt(c.slot, zero);
    legs.setMatrixAt(c.slot * 2, zero);
    legs.setMatrixAt(c.slot * 2 + 1, zero);
    arms.setMatrixAt(c.slot * 2, zero);
    arms.setMatrixAt(c.slot * 2 + 1, zero);
  }

  // Returns true when the hit destroyed the car / downed the officer.
  sys.damageCar = (v, dmg) => {
    v.hp -= dmg;
    if (v.hp <= 0) {
      effects.burst(v.x, v.y + 0.8, v.z, { n: 12, color: 0x55505e, speed: 6, size: 0.3, life: 0.9, up: 3 });
      effects.burst(v.x, v.y + 0.8, v.z, { n: 6, color: 0xffb02e, speed: 8, size: 0.14, life: 0.4 });
      despawnCar(v);
      return true;
    }
    return false;
  };
  sys.damageCop = (c, dmg) => {
    c.hp -= dmg;
    if (c.hp <= 0) {
      effects.burst(c.x, c.y + 1, c.z, { n: 8, color: 0x8f7bff, speed: 4, size: 0.16, life: 0.5 });
      despawnFoot(c);
      return true;
    }
    return false;
  };

  function blocked(x, z) {
    for (const b of tall) {
      if (x > b.minX - 1.4 && x < b.maxX + 1.4 && z > b.minZ - 1.4 && z < b.maxZ + 1.4) return true;
    }
    return false;
  }

  // Pursuit routing: go direct when the line is clear, otherwise follow the
  // road grid (Manhattan-style) so cruisers never wedge into a city block.
  const lines = city.roads.lines;
  const nearestLine = (v) => lines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  function routeAim(v, tx, tz) {
    if (!segmentBlocked(v.x, v.z, tx, tz, tall)) return { x: tx, z: tz };
    const nx = nearestLine(v.x), nz = nearestLine(v.z);
    const onVert = Math.abs(v.x - nx) < 7, onHoriz = Math.abs(v.z - nz) < 7;
    if (onVert && onHoriz) {
      return Math.abs(tx - v.x) > Math.abs(tz - v.z)
        ? { x: nearestLine(tx), z: nz }
        : { x: nx, z: nearestLine(tz) };
    }
    if (onVert) return { x: nx, z: nearestLine(tz) };
    if (onHoriz) return { x: nearestLine(tx), z: nz };
    return Math.abs(v.x - nx) < Math.abs(v.z - nz) ? { x: nx, z: v.z } : { x: v.x, z: nz };
  }

  sys.update = (dt, ctx) => {
    const { state, player, combat, wanted, time } = ctx;
    const focus = state.mode === 'driving' && vehicles.playerCar ? vehicles.playerCar : player.pos;
    const level = state.wanted;

    // Line of sight from any unit (previous positions) decides escape + targets.
    sys.seesPlayer = false;
    if (level > 0 && !state.down) {
      for (const v of cars) {
        if (Math.hypot(v.x - focus.x, v.z - focus.z) < PL.losRange && !segmentBlocked(v.x, v.z, focus.x, focus.z, tall)) { sys.seesPlayer = true; break; }
      }
      if (!sys.seesPlayer) for (const c of foot) {
        if (Math.hypot(c.x - focus.x, c.z - focus.z) < 48 && !segmentBlocked(c.x, c.z, focus.x, focus.z, tall)) { sys.seesPlayer = true; break; }
      }
    }

    if (!state.down) {
      // Reinforcements only while the crime is hot; far units stand down.
      const wantCars = level > 0 ? Math.min(level, PL.maxCars) : 0;
      const wantFoot = level > 0 && state.mode === 'onfoot' ? Math.min(level, PL.maxFoot) : 0;
      for (let i = cars.length - 1; i >= 0; i--) {
        const v = cars[i];
        if (level <= 0 || Math.hypot(v.x - focus.x, v.z - focus.z) > 175) despawnCar(v);
      }
      // Reinforcements respond to the crime scene (or a spotted player),
      // never to a runner who already broke away unseen.
      const dispatch = sys.seesPlayer || Math.hypot(focus.x - wanted.crimePos.x, focus.z - wanted.crimePos.z) < 60;
      const reinforce = wanted.hot > 0 && dispatch;
      if (reinforce) for (let a = 0; a < 6 && cars.length < wantCars; a++) spawnCar(sys.seesPlayer ? focus : wanted.crimePos);
      for (let i = foot.length - 1; i >= 0; i--) {
        const c = foot[i];
        if (wantFoot === 0 || Math.hypot(c.x - focus.x, c.z - focus.z) > 100) despawnFoot(c);
      }
      if (reinforce) for (let a = 0; a < 6 && foot.length < wantFoot; a++) spawnFoot(sys.seesPlayer ? focus : wanted.crimePos);

      // ---- patrol cars: pursue, avoid buildings, ram up close ----
      for (const v of cars) {
        v.cd = Math.max(0, v.cd - dt);
        if (sys.seesPlayer) { v.tx = focus.x; v.tz = focus.z; }
        if (v.stun > 0) {
          v.stun = Math.max(0, v.stun - dt);
          updateVehiclePhysics(v, dt, { throttle: 0, steer: 0 }, city);
          continue;
        }
        const dist = Math.hypot(v.tx - v.x, v.tz - v.z);
        const aimPt = dist < 26 ? { x: v.tx, z: v.tz } : routeAim(v, v.tx, v.tz);
        const dx = aimPt.x - v.x, dz = aimPt.z - v.z;
        let aim = Math.atan2(dx, dz);
        const px = v.x + Math.sin(v.yaw) * 9, pz = v.z + Math.cos(v.yaw) * 9;
        if (blocked(px, pz)) {
          const l = !blocked(v.x + Math.sin(v.yaw - 0.85) * 9, v.z + Math.cos(v.yaw - 0.85) * 9);
          const r = !blocked(v.x + Math.sin(v.yaw + 0.85) * 9, v.z + Math.cos(v.yaw + 0.85) * 9);
          aim = v.yaw + (l && !r ? -0.85 : r && !l ? 0.85 : rng() < 0.5 ? -0.85 : 0.85);
        }
        let diff = (aim - v.yaw) % TAU;
        if (diff > Math.PI) diff -= TAU;
        if (diff < -Math.PI) diff += TAU;
        const steer = clamp(diff * 2.5, -1, 1);
        const top = PL.carTop + level * 1.5;
        const targetSpeed = dist < 6 ? 0 : dist < 16 ? top : top * 0.92;
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
        const fwd = v.vx * fx + v.vz * fz;
        let throttle = clamp((targetSpeed - fwd) * 0.5, -1, 1);
        // Nose against a wall with no clear side: back up, then try again.
        v.stuck = fwd < 1.5 && throttle > 0.5 ? (v.stuck || 0) + dt : 0;
        if (v.stuck > 0.7) { v.rev = 0.8; v.stuck = 0; }
        if (v.rev > 0) { v.rev -= dt; throttle = -1; }
        updateVehiclePhysics(v, dt, { throttle, steer }, city);
        // Ram damage with a per-car cooldown so it never instant-kills.
        const sp = Math.hypot(v.vx, v.vz);
        if (state.mode === 'driving' && vehicles.playerCar) {
          const pc = vehicles.playerCar;
          if (Math.hypot(v.x - pc.x, v.z - pc.z) < 4.4 && v.cd <= 0 && (v.impact > 4 || pc.impact > 4)) {
            v.cd = 0.9;
            combat.damagePlayer(4, 'police');
            effects.burst((v.x + pc.x) / 2, v.y + 0.7, (v.z + pc.z) / 2, { n: 5, color: 0xffd98a, speed: 5, size: 0.12, life: 0.3 });
          }
        } else if (Math.hypot(v.x - player.pos.x, v.z - player.pos.z) < 2.6 && sp > 4 && v.cd <= 0) {
          v.cd = 1.1;
          combat.damagePlayer(12, 'police');
        }
      }

      // ---- foot officers: close in, shoot on sight, arrest up close ----
      for (const c of foot) {
        if (sys.seesPlayer) { c.tx = player.pos.x; c.tz = player.pos.z; }
        const dx = c.tx - c.x, dz = c.tz - c.z;
        const dist = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
        c.yaw = Math.atan2(player.pos.x - c.x, player.pos.z - c.z);
        let spd = 0;
        const d2 = Math.hypot(dx, dz);
        if (d2 > 1.9) {
          spd = 4.3;
          c.x += (dx / d2) * spd * dt;
          c.z += (dz / d2) * spd * dt;
          const pos = { x: c.x, z: c.z };
          resolveCircleVsBoxes(pos, 0.36, city.colliders);
          city.clampToWorld(pos);
          c.x = pos.x; c.z = pos.z;
        }
        c.y = city.groundHeightAt(c.x, c.z);
        c.phase += spd * 3 * dt;
        c.shoot -= dt;
        if (dist < PL.shootRange && c.shoot <= 0 && !segmentBlocked(c.x, c.z, player.pos.x, player.pos.z, tall)) {
          c.shoot = PL.shootEvery + rng() * 0.5;
          const gx = c.x + Math.sin(c.yaw) * 0.5, gz = c.z + Math.cos(c.yaw) * 0.5, gy = c.y + 1.35;
          effects.flash(gx, gy, gz);
          const hit = rng() < clamp(0.72 - dist * 0.014 - state.player.speed * 0.025, 0.15, 0.8);
          const tx = player.pos.x + (hit ? 0 : (rng() - 0.5) * 2.6);
          const tz = player.pos.z + (hit ? 0 : (rng() - 0.5) * 2.6);
          effects.tracer(gx, gy, gz, tx, player.pos.y + 1.1, tz);
          if (hit) {
            combat.damagePlayer(PL.shotDamage, 'police');
            effects.burst(player.pos.x, player.pos.y + 1.1, player.pos.z, { n: 3, color: 0xff8a5c, speed: 3, size: 0.1, life: 0.25 });
          }
        }
      }

      // ---- capture: sustained close contact on foot ----
      if (state.mode === 'onfoot' && level > 0) {
        let near = false;
        for (const c of foot) if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < PL.captureDist) { near = true; break; }
        if (!near) for (const v of cars) {
          if (Math.hypot(v.x - player.pos.x, v.z - player.pos.z) < 3.4 && state.player.speed < 2.5) { near = true; break; }
        }
        sys.capture = near ? sys.capture + dt : Math.max(0, sys.capture - dt * 2);
        if (sys.capture >= PL.captureTime) { sys.capture = 0; combat.bust(); }
      } else sys.capture = 0;
    }
    syncVisuals(time);
  };

  function setPart(mesh, slot, c, lx, ly, lz, sx, sy, sz, pitch) {
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    dummy.position.set(c.x + lx * co + lz * si, c.y + ly, c.z - lx * si + lz * co);
    dummy.rotation.order = 'YXZ';
    dummy.rotation.set(pitch || 0, c.yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
  }

  function syncVisuals(time) {
    const flashOn = Math.floor(time * 5) % 2 === 0;
    for (let i = 0; i < MAXC; i++) {
      const v = cars[i];
      if (!v) { bar.setMatrixAt(i, zero); continue; }
      const s = v.spec;
      dummy.position.set(v.x, v.y + 0.32 + s.bodyH + s.cabinH + 0.09, v.z);
      dummy.rotation.set(0, v.yaw, 0);
      dummy.scale.set(0.85, 0.16, 0.34);
      dummy.updateMatrix();
      bar.setMatrixAt(i, dummy.matrix);
      bar.setColorAt(i, tmpColor.setHex(flashOn === (i % 2 === 0) ? 0xff3b30 : 0x3b8bff));
    }
    bar.instanceMatrix.needsUpdate = true;
    if (bar.instanceColor) bar.instanceColor.needsUpdate = true;
    for (const c of foot) {
      const swing = Math.sin(c.phase) * 0.7;
      setPart(torsos, c.slot, c, 0, 1.06, 0, 0.44, 0.58, 0.27, 0);
      setPart(heads, c.slot, c, 0, 1.54, 0, 0.28, 0.3, 0.28, 0);
      setPart(caps, c.slot, c, 0, 1.72, 0, 0.34, 0.09, 0.34, 0);
      setPart(legs, c.slot * 2, c, -0.1, 0.78, 0, 1, 1, 1, swing);
      setPart(legs, c.slot * 2 + 1, c, 0.1, 0.78, 0, 1, 1, 1, -swing);
      setPart(arms, c.slot * 2, c, -0.29, 1.34, 0, 1, 1, 1, -swing * 0.7);
      setPart(arms, c.slot * 2 + 1, c, 0.29, 1.34, 0, 1, 1, 1, swing * 0.7);
    }
    for (const m of [torsos, heads, caps, legs, arms]) m.instanceMatrix.needsUpdate = true;
  }

  sys.reset = () => {
    for (let i = cars.length - 1; i >= 0; i--) despawnCar(cars[i]);
    for (let i = foot.length - 1; i >= 0; i--) despawnFoot(foot[i]);
    sys.capture = 0;
    sys.seesPlayer = false;
    syncVisuals(0);
  };
  return sys;
}