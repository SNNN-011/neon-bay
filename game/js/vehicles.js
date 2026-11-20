// Neon Bay — vehicles: original low-poly car factory (sedan / sport / van /
// pickup), arcade driving physics (accel, brake, steer, handbrake drift) and
// collision against buildings, other cars and the player. Every car that is
// not currently driven by the player renders through shared InstancedMeshes;
// the player's car swaps to a detailed mesh so it reads up close.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, mulberry32, pick, resolveCircleVsBoxes } from './util.js';

export const VEHICLE_TYPES = {
  sedan:  { len: 4.4, wid: 1.9,  bodyH: 0.62, cabinH: 0.55, cabinLen: 2.2, cabinZ: -0.2,  top: 30, accel: 11, steer: 2.3, mass: 1.0 },
  sport:  { len: 4.2, wid: 1.95, bodyH: 0.5,  cabinH: 0.45, cabinLen: 1.9, cabinZ: -0.35, top: 38, accel: 15, steer: 2.6, mass: 0.9 },
  van:    { len: 4.9, wid: 2.05, bodyH: 0.7,  cabinH: 1.0,  cabinLen: 3.4, cabinZ: 0.1,   top: 24, accel: 8,  steer: 1.9, mass: 1.4 },
  pickup: { len: 4.8, wid: 2.0,  bodyH: 0.66, cabinH: 0.6,  cabinLen: 1.6, cabinZ: 0.7,   top: 27, accel: 10, steer: 2.1, mass: 1.2 },
};
const TYPE_NAMES = Object.keys(VEHICLE_TYPES);
export const randomCarType = (rng) => pick(rng, TYPE_NAMES);

const WHEEL_R = 0.34;
const BODY_Y = 0.32; // chassis ride height above ground

// Detailed mesh for the car the player is inside (~10 draw calls, one car).
export function createVehicleMesh(type, color) {
  const s = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x27304a, roughness: 0.2, metalness: 0.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 0.95 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.4, metalness: 0.6 });
  function part(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  }
  part(new THREE.BoxGeometry(s.wid, s.bodyH, s.len), paint, 0, BODY_Y + s.bodyH / 2, 0);
  part(new THREE.BoxGeometry(s.wid * 0.86, s.cabinH, s.cabinLen), glass, 0, BODY_Y + s.bodyH + s.cabinH / 2, s.cabinZ);
  part(new THREE.BoxGeometry(s.wid * 0.96, 0.16, 0.3), chrome, 0, BODY_Y + 0.1, s.len / 2 - 0.05);
  part(new THREE.BoxGeometry(s.wid * 0.96, 0.16, 0.3), chrome, 0, BODY_Y + 0.1, -s.len / 2 + 0.05);
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.24, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [ox, oz] of wheelOffsets(s)) wheels.push(part(wheelGeo, rubber, ox, WHEEL_R, oz));
  part(new THREE.BoxGeometry(s.wid * 0.8, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), 0, BODY_Y + s.bodyH * 0.6, s.len / 2 + 0.02);
  part(new THREE.BoxGeometry(s.wid * 0.8, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xff4a3d }), 0, BODY_Y + s.bodyH * 0.6, -s.len / 2 - 0.02);
  g.userData.wheels = wheels;
  g.userData.wheelSpin = 0;
  return g;
}

function wheelOffsets(s) {
  const ox = s.wid / 2 - 0.02, oz = s.len / 2 - 0.95;
  return [[-ox, oz], [ox, oz], [-ox, -oz], [ox, -oz]];
}

// Two-circle footprint (front + rear) approximates the car's oriented box
// much better than one fat circle, so adjacent lanes don't phantom-collide.
export function carCircles(v) {
  const s = v.spec;
  const r = s.wid * 0.55;
  const off = s.len / 2 - r;
  const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
  return [
    { x: v.x + sy * off, z: v.z + cy * off, r },
    { x: v.x - sy * off, z: v.z - cy * off, r },
  ];
}

// Arcade physics: velocity is split into forward / lateral components in the
// car's frame. Engine and brake act forward; lateral grip decays slip — the
// handbrake drops grip so the tail slides. Yaw rotates AFTER the velocity is
// recomposed, which is what produces the drift feel.
export function updateVehiclePhysics(v, dt, ctrl, city) {
  const s = v.spec;
  const sy = Math.sin(v.yaw), cy = Math.cos(v.yaw);
  let f = v.vx * sy + v.vz * cy;        // forward speed
  let l = v.vx * -cy + v.vz * sy;       // lateral slip
  const throttle = ctrl.throttle || 0;
  const handbrake = !!ctrl.handbrake;
  const stunned = v.stun > 0;

  if (!stunned) {
    if (throttle > 0) f += s.accel * throttle * dt;
    else if (throttle < 0) f += (f > 0.5 ? 22 : s.accel * 0.5) * throttle * dt;
  }
  f = clamp(f, -8, s.top);
  f *= Math.exp(-(stunned ? 1.6 : 0.18) * dt);           // drag
  if (Math.abs(throttle) < 0.05 || stunned) f -= Math.sign(f) * Math.min(Math.abs(f), 2.2 * dt);
  if (handbrake) f *= Math.exp(-1.1 * dt);
  l *= Math.exp(-(handbrake ? 1.7 : 9) * dt);            // tire grip

  v.vx = f * sy + l * -cy;
  v.vz = f * cy + l * sy;

  if (!stunned) {
    const grip = clamp(Math.abs(f) / 5, 0, 1) / (1 + Math.abs(f) * 0.015);
    v.yaw += (ctrl.steer || 0) * s.steer * (handbrake ? 1.5 : 1) * grip * Math.sign(f) * dt;
  }
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  v.speed = f;

  // Buildings / parked cars / plaza props: resolve both footprint circles.
  const ox = v.x, oz = v.z;
  v.impact = 0;
  for (const c of carCircles(v)) {
    const pos = { x: c.x, z: c.z };
    if (resolveCircleVsBoxes(pos, c.r, city.colliders)) {
      v.x += pos.x - c.x;
      v.z += pos.z - c.z;
    }
  }
  const dx = v.x - ox, dz = v.z - oz;
  if (dx !== 0 || dz !== 0) {
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    const vn = v.vx * nx + v.vz * nz;
    if (vn < 0) {
      v.impact = -vn;
      v.vx -= nx * vn * 1.5;
      v.vz -= nz * vn * 1.5;
      v.vx *= 0.7; v.vz *= 0.7;
      if (v.impact > 5 && v.kind === 'traffic') v.stun = Math.max(v.stun, 1.2);
    }
  }
  city.clampToWorld(v);
  v.y = city.groundHeightAt(v.x, v.z);
  return v.impact;
}

// Car-vs-car impulse (two-circle footprints) + knockback on the on-foot player.
function collideCars(list, player, mode) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.active) continue;
    const ca = carCircles(a);
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.active) continue;
      const cb = carCircles(b);
      let overlap = 0;
      for (const pa of ca) for (const pb of cb) {
        const d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        overlap = Math.max(overlap, pa.r + pb.r - d);
      }
      if (overlap <= 0) continue;
      const dx = a.x - b.x, dz = a.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d, nz = dz / d;
      const ma = a.spec.mass, mb = b.spec.mass, mt = ma + mb;
      a.x += nx * overlap * (mb / mt); a.z += nz * overlap * (mb / mt);
      b.x -= nx * overlap * (ma / mt); b.z -= nz * overlap * (ma / mt);
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel < 0) {
        const jimp = -(1.25 * rel) / (1 / ma + 1 / mb);
        a.vx += (nx * jimp) / ma; a.vz += (nz * jimp) / ma;
        b.vx -= (nx * jimp) / mb; b.vz -= (nz * jimp) / mb;
        const hard = Math.abs(jimp) / Math.min(ma, mb);
        if (hard > 4) {
          if (a.kind === 'traffic') a.stun = Math.max(a.stun, 2.2);
          if (b.kind === 'traffic') b.stun = Math.max(b.stun, 2.2);
        }
        a.impact = Math.max(a.impact || 0, -rel);
        b.impact = Math.max(b.impact || 0, -rel);
      }
    }
    // Knock the player around when a moving car clips them on foot.
    if (mode === 'onfoot') {
      for (const c of ca) {
        const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
        const rr = c.r + 0.5;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nx = dx / d, nz = dz / d;
          player.pos.x = c.x + nx * rr;
          player.pos.z = c.z + nz * rr;
          const cs = Math.hypot(a.vx, a.vz);
          if (cs > 1.5) {
            player.knockX += a.vx * 0.55 + nx * 2.5;
            player.knockZ += a.vz * 0.55 + nz * 2.5;
          }
          break;
        }
      }
    }
  }
}

const MAX_INSTANCES = 48;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export function createVehicleSystem(scene, city) {
  const list = [];
  const freeSlots = [];
  for (let i = MAX_INSTANCES - 1; i >= 0; i--) freeSlots.push(i);
  let nextId = 1;

  // Shared instanced parts: the whole non-player fleet costs 5 draw calls.
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const bodies = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 }), MAX_INSTANCES);
  const cabins = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0x27304a, roughness: 0.2, metalness: 0.4 }), MAX_INSTANCES);
  const wheels = new THREE.InstancedMesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 0.95 }), MAX_INSTANCES * 4);
  const headl = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), MAX_INSTANCES);
  const tail = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: 0xff4a3d }), MAX_INSTANCES);
  const meshes = [bodies, cabins, wheels, headl, tail];
  for (const m of meshes) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  bodies.castShadow = true; bodies.receiveShadow = true;
  cabins.castShadow = true;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAX_INSTANCES; i++) {
    bodies.setMatrixAt(i, zero); cabins.setMatrixAt(i, zero);
    headl.setMatrixAt(i, zero); tail.setMatrixAt(i, zero);
    for (let k = 0; k < 4; k++) wheels.setMatrixAt(i * 4 + k, zero);
  }

  const system = {
    list,
    carBoxes: [],
    playerCar: null,
    rng: mulberry32(555),
    spawn(opts) {
      if (!freeSlots.length) return null;
      const type = opts.type || 'sedan';
      const v = {
        id: nextId++,
        type,
        spec: VEHICLE_TYPES[type],
        color: opts.color !== undefined ? opts.color : pick(system.rng, CONFIG.palette.cars),
        x: opts.x, z: opts.z, y: city.groundHeightAt(opts.x, opts.z),
        yaw: opts.yaw || 0,
        vx: 0, vz: 0, speed: 0, impact: 0,
        kind: opts.kind || 'parked',   // parked | traffic | player
        occupied: false,
        stolen: false,
        ai: null,
        stun: 0,
        mesh: null,
        slot: freeSlots.pop(),
        active: true,
      };
      list.push(v);
      bodies.setColorAt(v.slot, tmpColor.setHex(v.color));
      bodies.instanceColor.needsUpdate = true;
      return v;
    },
    despawn(v) {
      v.active = false;
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1);
      freeSlots.push(v.slot);
      bodies.setMatrixAt(v.slot, zero);
      cabins.setMatrixAt(v.slot, zero);
      headl.setMatrixAt(v.slot, zero);
      tail.setMatrixAt(v.slot, zero);
      for (let k = 0; k < 4; k++) wheels.setMatrixAt(v.slot * 4 + k, zero);
      if (system.playerCar === v) system.playerCar = null;
    },
    // Swap a car to the detailed mesh (player enters) or back to instances.
    attachPlayerMesh(v) {
      if (v.mesh) return;
      v.mesh = createVehicleMesh(v.type, v.color);
      scene.add(v.mesh);
      bodies.setMatrixAt(v.slot, zero);
      cabins.setMatrixAt(v.slot, zero);
      headl.setMatrixAt(v.slot, zero);
      tail.setMatrixAt(v.slot, zero);
      for (let k = 0; k < 4; k++) wheels.setMatrixAt(v.slot * 4 + k, zero);
    },
    detachPlayerMesh(v) {
      if (!v.mesh) return;
      scene.remove(v.mesh);
      v.mesh.traverse((o) => {
        if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
      });
      v.mesh = null;
      bodies.setColorAt(v.slot, tmpColor.setHex(v.color));
      bodies.instanceColor.needsUpdate = true;
    },
    nearestEnterable(x, z, maxDist) {
      let best = null, bestD = maxDist;
      for (const v of list) {
        if (!v.active || v.occupied || v.kind === 'player') continue;
        const d = Math.hypot(v.x - x, v.z - z) - v.spec.len * 0.35;
        if (d < bestD) { bestD = d; best = v; }
      }
      return best;
    },
    // Player-car physics, car-car + car-player collision, instance sync.
    update(dt, ctx) {
      const { input, state, player } = ctx;
      const pc = system.playerCar;
      if (pc && state.mode === 'driving') {
        const ctrl = {
          throttle: (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) + (input.isDown('KeyS') || input.isDown('ArrowDown') ? -1 : 0),
          steer: (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) + (input.isDown('KeyD') || input.isDown('ArrowRight') ? -1 : 0),
          handbrake: input.isDown('Space'),
        };
        updateVehiclePhysics(pc, dt, ctrl, city);
      }
      // Abandoned / parked cars coast to a stop (traffic owns its own cars).
      for (const v of list) {
        if (v === pc || v.kind === 'traffic') continue;
        if (Math.abs(v.vx) + Math.abs(v.vz) > 0.01) updateVehiclePhysics(v, dt, { throttle: 0, steer: 0 }, city);
      }
      collideCars(list, player, state.mode);

      // Rebuild dynamic AABBs so the on-foot player collides with every car.
      system.carBoxes.length = 0;
      for (const v of list) {
        const s = v.spec;
        const c = Math.abs(Math.cos(v.yaw)), sn = Math.abs(Math.sin(v.yaw));
        const hx = c * s.wid / 2 + sn * s.len / 2;
        const hz = sn * s.wid / 2 + c * s.len / 2;
        system.carBoxes.push({ minX: v.x - hx, maxX: v.x + hx, minZ: v.z - hz, maxZ: v.z + hz, height: 1.7 });
      }
      syncInstances();
      if (pc && pc.mesh) {
        pc.mesh.position.set(pc.x, pc.y, pc.z);
        pc.mesh.rotation.y = pc.yaw;
        pc.mesh.userData.wheelSpin += pc.speed * dt / WHEEL_R;
        for (const w of pc.mesh.userData.wheels) w.rotation.x = pc.mesh.userData.wheelSpin;
      }
    },
  };

  function setPart(mesh, slot, v, lx, ly, lz, sx, sy, sz) {
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    dummy.position.set(v.x + lx * c + lz * s, v.y + ly, v.z - lx * s + lz * c);
    dummy.rotation.set(0, v.yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
  }

  function syncInstances() {
    for (const v of list) {
      if (v.mesh) continue; // detailed player mesh owns this car
      const s = v.spec, i = v.slot;
      setPart(bodies, i, v, 0, BODY_Y + s.bodyH / 2, 0, s.wid, s.bodyH, s.len);
      setPart(cabins, i, v, 0, BODY_Y + s.bodyH + s.cabinH / 2, s.cabinZ, s.wid * 0.86, s.cabinH, s.cabinLen);
      setPart(headl, i, v, 0, BODY_Y + s.bodyH * 0.6, s.len / 2 + 0.02, s.wid * 0.8, 0.12, 0.06);
      setPart(tail, i, v, 0, BODY_Y + s.bodyH * 0.6, -s.len / 2 - 0.02, s.wid * 0.8, 0.12, 0.06);
      const offs = wheelOffsets(s);
      for (let k = 0; k < 4; k++) setPart(wheels, i * 4 + k, v, offs[k][0], WHEEL_R, offs[k][1], 1, 1, 1);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  return system;
}