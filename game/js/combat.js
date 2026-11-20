// Neon Bay — combat: punch up close, pistol aimed through the crosshair
// (camera ray, works with or without pointer lock), health + armor, rotating
// pickups, and the BUSTED / WASTED down-and-respawn flow. Hits feed the wanted
// system; shots scatter pedestrians via triggerFlee.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, mulberry32, pick } from './util.js';
import { carCircles } from './vehicles.js';

const CB = CONFIG.combat;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);
const PICKUP_COLORS = { ammo: 0xffc36b, health: 0xff5f9e, armor: 0x35e0d2 };

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const ex = cx - ox, ey = cy - oy, ez = cz - oz;
  const t = ex * dx + ey * dy + ez * dz;
  if (t < 0) return Infinity;
  const d2 = ex * ex + ey * ey + ez * ez - t * t;
  if (d2 > r * r) return Infinity;
  return t - Math.sqrt(r * r - d2);
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.minX, b.maxX], [oy, dy, 0, b.height], [oz, dz, b.minZ, b.maxZ]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function createCombat(deps) {
  const { scene, city, state, player, vehicles, peds, police, effects, input, camera, wanted, rig, exitVehicle } = deps;
  const canvas = deps.canvas;
  const tall = city.colliders.filter((b) => b.height > 3);
  const bustedEl = document.getElementById('busted-screen');
  const wastedEl = document.getElementById('wasted-screen');

  state.weapon = 'pistol';
  state.ammo = CB.startAmmo;

  // ---- pickups: deterministic spots on sidewalk corners around the grid ----
  const prng = mulberry32(99);
  const pickups = [];
  const types = ['ammo', 'health', 'ammo', 'armor'];
  for (let k = 0; k < 12; k++) {
    const cx = pick(prng, city.cellCenters), cz = pick(prng, city.cellCenters);
    const x = cx + (prng() < 0.5 ? -12.5 : 12.5), z = cz + (prng() < 0.5 ? -12.5 : 12.5);
    pickups.push({ x, z, y: city.groundHeightAt(x, z), type: types[k % 4], on: true, timer: 0 });
  }
  const pickMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.42),
    new THREE.MeshBasicMaterial(),
    pickups.length
  );
  pickMesh.frustumCulled = false;
  pickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pickMesh);
  pickups.forEach((p, i) => pickMesh.setColorAt(i, tmpColor.setHex(PICKUP_COLORS[p.type])));
  pickMesh.instanceColor.needsUpdate = true;

  let fireCd = 0, queued = false, ramCd = 0, skidTimer = 0, smokeTimer = 0, spin = 0;
  const aimDir = new THREE.Vector3();

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && state.started && !state.paused && !state.down && state.mode === 'onfoot') queued = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const sys = { pickups };

  function collect(p) {
    p.on = false;
    p.timer = CB.pickupRespawn;
    if (p.type === 'ammo') state.ammo = Math.min(99, state.ammo + 12);
    else if (p.type === 'health') state.health = Math.min(100, state.health + 30);
    else state.armor = Math.min(100, state.armor + 50);
    effects.burst(p.x, p.y + 1, p.z, { n: 6, color: PICKUP_COLORS[p.type], speed: 3, size: 0.12, life: 0.4, up: 2.5 });
  }

  sys.collectPickups = () => {
    let n = 0;
    for (const p of pickups) {
      if (p.on && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 5) { collect(p); n++; }
    }
    return n;
  };

  sys.damagePlayer = (n, source) => {
    if (state.down || !state.started) return;
    const absorbed = Math.min(state.armor, n);
    state.armor -= absorbed;
    state.health -= n - absorbed;
    if (state.health <= 0) {
      state.health = 0;
      if (source === 'police') sys.bust();
      else goDown('wasted');
    }
  };

  function goDown(kind) {
    if (state.down) return;
    if (state.mode === 'driving') exitVehicle();
    state.down = kind;
    state.downTimer = 2.6;
    const fine = kind === 'busted' ? CONFIG.police.bustFine + state.wanted * 40 : CB.wastedFine;
    state.downFine = Math.min(state.cash, fine);
    const el = kind === 'busted' ? bustedEl : wastedEl;
    el.querySelector('p').textContent = kind === 'busted'
      ? 'Neon Bay PD booked Riko. Fine: $' + state.downFine + '. The Tidewater Crew will hear about this.'
      : 'Riko hits the pavement. Medics patch him up for $' + state.downFine + '.';
    el.classList.remove('hidden');
  }
  sys.bust = () => goDown('busted');

  function respawn() {
    bustedEl.classList.add('hidden');
    wastedEl.classList.add('hidden');
    state.cash = Math.max(0, state.cash - state.downFine);
    state.down = null;
    state.health = 100;
    state.armor = 0;
    state.ammo = Math.max(state.ammo, 12);
    wanted.reset();
    police.reset();
    player.teleport(CONFIG.player.spawn.x, CONFIG.player.spawn.z, city.groundHeightAt);
    player.yaw = Math.PI;
    player.knockX = player.knockZ = 0;
    player.group.visible = true;
    rig.initialized = false;
  }

  // ---- attacks -------------------------------------------------------------
  function hurtPed(p, dmg, kx, kz) {
    if (p.hp === undefined) p.hp = CB.pedHp;
    p.hp -= dmg;
    p.kx += kx; p.kz += kz;
    effects.burst(p.x, p.y + 1.1, p.z, { n: 4, color: 0xffd98a, speed: 3.5, size: 0.11, life: 0.3 });
    wanted.crime(8);
    if (p.hp <= 0) {
      effects.burst(p.x, p.y + 1, p.z, { n: 8, color: 0xff8fb3, speed: 4, size: 0.15, life: 0.5 });
      peds.remove(p);
      wanted.crime(6);
    }
  }
  function hurtCop(c, dmg) {
    effects.burst(c.x, c.y + 1.1, c.z, { n: 4, color: 0xffd98a, speed: 3.5, size: 0.11, life: 0.3 });
    wanted.crime(12);
    if (police.damageCop(c, dmg)) wanted.crime(10);
  }
  function hurtCar(v, dmg) {
    if (v.hp === undefined) v.hp = CB.carHp;
    const destroyed = v.kind === 'police' ? police.damageCar(v, dmg) : (v.hp -= dmg) <= 0;
    if (v.kind === 'police') wanted.crime(10);
    else wanted.crime(3);
    if (destroyed && v.kind !== 'police') {
      effects.burst(v.x, v.y + 0.8, v.z, { n: 12, color: 0x55505e, speed: 6, size: 0.3, life: 0.9, up: 3 });
      effects.burst(v.x, v.y + 0.8, v.z, { n: 6, color: 0xffb02e, speed: 8, size: 0.14, life: 0.4 });
      vehicles.despawn(v);
    }
  }

  function melee() {
    let best = null, bestD = CB.punchRange;
    for (const p of peds.list) {
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (d < bestD) { bestD = d; best = { kind: 'ped', o: p }; }
    }
    for (const c of police.foot) {
      const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
      if (d < bestD) { bestD = d; best = { kind: 'cop', o: c }; }
    }
    if (!best) return false;
    const o = best.o;
    const dx = o.x - player.pos.x, dz = o.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    player.yaw = Math.atan2(dx, dz);
    if (best.kind === 'ped') hurtPed(o, CB.punchDamage, (dx / d) * 6, (dz / d) * 6);
    else hurtCop(o, CB.punchDamage);
    peds.triggerFlee(player.pos.x, player.pos.z, 14);
    fireCd = 0.35;
    return true;
  }

  function fire() {
    if (state.ammo <= 0 || fireCd > 0) return false;
    state.ammo--;
    fireCd = CB.fireEvery;
    camera.getWorldDirection(aimDir);
    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    const mx = player.pos.x + aimDir.x * 0.7, my = player.pos.y + 1.35, mz = player.pos.z + aimDir.z * 0.7;
    effects.flash(mx, my, mz);
    effects.burst(mx, my, mz, { n: 2, color: 0xffe9a8, speed: 2, size: 0.12, life: 0.12, g: 0, up: 0.5 });
    let bestT = CB.range, hit = null;
    for (const p of peds.list) {
      const t = raySphere(ox, oy, oz, aimDir.x, aimDir.y, aimDir.z, p.x, p.y + 1, p.z, 0.75);
      if (t < bestT) { bestT = t; hit = { kind: 'ped', o: p }; }
    }
    for (const c of police.foot) {
      const t = raySphere(ox, oy, oz, aimDir.x, aimDir.y, aimDir.z, c.x, c.y + 1, c.z, 0.75);
      if (t < bestT) { bestT = t; hit = { kind: 'cop', o: c }; }
    }
    for (const v of vehicles.list) {
      if (v === vehicles.playerCar || !v.active) continue;
      const t = raySphere(ox, oy, oz, aimDir.x, aimDir.y, aimDir.z, v.x, v.y + 0.7, v.z, 1.7);
      if (t < bestT) { bestT = t; hit = { kind: 'car', o: v }; }
    }
    for (const b of tall) {
      const t = rayBox(ox, oy, oz, aimDir.x, aimDir.y, aimDir.z, b);
      if (t < bestT) { bestT = t; hit = { kind: 'wall' }; }
    }
    const hx = ox + aimDir.x * bestT, hy = oy + aimDir.y * bestT, hz = oz + aimDir.z * bestT;
    effects.tracer(mx, my, mz, hx, hy, hz);
    peds.triggerFlee(player.pos.x, player.pos.z, 30);
    if (hit) {
      if (hit.kind === 'ped') {
        const p = hit.o;
        const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z) || 1;
        hurtPed(p, CB.pistolDamage, ((p.x - player.pos.x) / d) * 3, ((p.z - player.pos.z) / d) * 3);
      } else if (hit.kind === 'cop') hurtCop(hit.o, CB.pistolDamage);
      else if (hit.kind === 'car') {
        effects.burst(hx, hy, hz, { n: 4, color: 0xffd98a, speed: 4, size: 0.1, life: 0.3 });
        hurtCar(hit.o, CB.pistolDamage);
      } else effects.burst(hx, hy, hz, { n: 4, color: 0xffd98a, speed: 3, size: 0.1, life: 0.25, g: -6 });
    }
    return true;
  }

  sys.attack = () => { queued = true; };
  sys.fireWeapon = () => fire();

  sys.update = (dt, ctx) => {
    if (state.down) {
      state.downTimer -= dt;
      if (state.downTimer <= 0) respawn();
      return;
    }
    fireCd -= dt;
    ramCd = Math.max(0, ramCd - dt);
    if (queued) {
      queued = false;
      if (state.started && !state.paused && state.mode === 'onfoot' && fireCd <= 0) {
        if (!melee()) fire();
      }
    }

    // ---- pickups spin / bob / respawn / collect ----
    spin += dt * 2.2;
    const focus = state.mode === 'driving' && vehicles.playerCar ? vehicles.playerCar : player.pos;
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (!p.on) {
        p.timer -= dt;
        if (p.timer <= 0) p.on = true;
        pickMesh.setMatrixAt(i, zero);
        continue;
      }
      if (Math.hypot(p.x - focus.x, p.z - focus.z) < CB.pickupRadius) { collect(p); pickMesh.setMatrixAt(i, zero); continue; }
      dummy.position.set(p.x, p.y + 0.95 + Math.sin(ctx.time * 3 + i) * 0.12, p.z);
      dummy.rotation.set(0, spin + i, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pickMesh.setMatrixAt(i, dummy.matrix);
    }
    pickMesh.instanceMatrix.needsUpdate = true;

    // ---- running people over / ramming police while driving ----
    const pc = vehicles.playerCar;
    if (state.mode === 'driving' && pc) {
      const sp = Math.hypot(pc.vx, pc.vz);
      const circles = carCircles(pc);
      for (let i = peds.list.length - 1; i >= 0; i--) {
        const p = peds.list[i];
        p.ramCd = Math.max(0, (p.ramCd || 0) - dt);
        if (sp < 5 || p.ramCd > 0) continue;
        for (const c of circles) {
          if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + 0.4) {
            p.ramCd = 1.5;
            hurtPed(p, 50, pc.vx * 0.6, pc.vz * 0.6);
            wanted.crime(4); // vehicular assault on top of the hit
            break;
          }
        }
      }
      if (ramCd <= 0) for (const v of police.cars) {
        let touch = false;
        for (const c of circles) if (Math.hypot(v.x - c.x, v.z - c.z) < c.r + v.spec.wid * 0.55 + 0.3) { touch = true; break; }
        if (touch && sp > 5) {
          ramCd = 1;
          wanted.crime(10);
          police.damageCar(v, 12);
          effects.burst((v.x + pc.x) / 2, v.y + 0.7, (v.z + pc.z) / 2, { n: 6, color: 0xffd98a, speed: 5, size: 0.12, life: 0.35 });
          break;
        }
      }
      // ---- skid marks: handbrake or big lateral slip ----
      const lat = -pc.vx * Math.cos(pc.yaw) + pc.vz * Math.sin(pc.yaw);
      if ((input.isDown('Space') && sp > 6) || Math.abs(lat) > 4.5) {
        skidTimer -= dt;
        if (skidTimer <= 0) {
          skidTimer = 0.035;
          effects.skid(pc.x, pc.z, pc.yaw);
        }
      }
      // ---- damaged cars smoke ----
      if (pc.hp !== undefined && pc.hp < 30) {
        smokeTimer -= dt;
        if (smokeTimer <= 0) {
          smokeTimer = 0.14;
          effects.smoke(pc.x + Math.sin(pc.yaw) * 1.6, pc.y + 0.9, pc.z + Math.cos(pc.yaw) * 1.6);
        }
      }
    }
    for (const v of police.cars) {
      if (v.hp < 30 && Math.random() < dt * 6) effects.smoke(v.x, v.y + 0.9, v.z);
    }
  };

  sys.reset = () => {
    bustedEl.classList.add('hidden');
    wastedEl.classList.add('hidden');
    state.down = null;
    state.downTimer = 0;
    state.weapon = 'pistol';
    state.ammo = CB.startAmmo;
    fireCd = 0; queued = false; ramCd = 0;
    for (const p of pickups) { p.on = true; p.timer = 0; }
    for (const p of peds.list) { p.hp = undefined; p.ramCd = 0; }
  };
  return sys;
}