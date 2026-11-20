// Neon Bay — third-person camera rig: mouse-look orbit, smooth follow,
// simple building avoidance, and fixed poses for screenshots.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, damp, dampAngle, pointInBox } from './util.js';

export function createCameraRig(camera, input) {
  const C = CONFIG.camera;
  const rig = {
    yaw: Math.PI,          // start looking north-ish down the street
    pitch: 0.22,
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    initialized: false,
  };

  const offset = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function applyLook() {
    const m = input.consumeMouse();
    rig.yaw -= m.dx * C.sensitivity;
    rig.pitch = clamp(rig.pitch + m.dy * C.sensitivity, C.minPitch, C.maxPitch);
  }

  // Orbit offset behind the target for the current yaw/pitch.
  function orbit(out, distance) {
    const cp = Math.cos(rig.pitch);
    out.set(Math.sin(rig.yaw) * cp, Math.sin(rig.pitch), Math.cos(rig.yaw) * cp).multiplyScalar(distance);
    return out;
  }

  function avoidBuildings(p, colliders) {
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (p.y > b.height + 0.4) continue;
      if (!pointInBox(p.x, p.z, b)) continue;
      const left = p.x - b.minX, right = b.maxX - p.x;
      const front = p.z - b.minZ, back = b.maxZ - p.z;
      const m = Math.min(left, right, front, back);
      if (m === left) p.x = b.minX - 0.3;
      else if (m === right) p.x = b.maxX + 0.3;
      else if (m === front) p.z = b.minZ - 0.3;
      else p.z = b.maxZ + 0.3;
    }
    if (p.y < 0.4) p.y = 0.4;
  }

  rig.update = function (dt, target, colliders) {
    applyLook();
    lookTarget.set(target.x, target.y + C.lookHeight, target.z);
    orbit(offset, C.distance);
    desired.copy(lookTarget).add(offset);
    avoidBuildings(desired, colliders);
    if (!rig.initialized) {
      rig.pos.copy(desired);
      rig.look.copy(lookTarget);
      rig.initialized = true;
    } else {
      rig.pos.x = damp(rig.pos.x, desired.x, C.followDamp, dt);
      rig.pos.y = damp(rig.pos.y, desired.y, C.followDamp, dt);
      rig.pos.z = damp(rig.pos.z, desired.z, C.followDamp, dt);
      rig.look.x = damp(rig.look.x, lookTarget.x, 16, dt);
      rig.look.y = damp(rig.look.y, lookTarget.y, 16, dt);
      rig.look.z = damp(rig.look.z, lookTarget.z, 16, dt);
    }
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
  };

  // Driving chase cam: hangs behind the car, stretches with speed and looks
  // ahead down the road. Mouse still adjusts pitch (and a little orbit).
  rig.updateChase = function (dt, car, colliders) {
    const m = input.consumeMouse();
    rig.pitch = clamp(rig.pitch + m.dy * C.sensitivity, 0.05, 0.7);
    const speed = Math.hypot(car.vx, car.vz);
    rig.yaw = dampAngle(rig.yaw, car.yaw + Math.PI, 4.5, dt);
    const dist = C.chaseDistance + speed * 0.16;
    const cp = Math.cos(C.chaseHeight);
    offset.set(Math.sin(rig.yaw) * cp, Math.sin(C.chaseHeight) + 0.12, Math.cos(rig.yaw) * cp).multiplyScalar(dist);
    lookTarget.set(
      car.x + Math.sin(car.yaw) * (1.5 + speed * 0.22),
      car.y + 1.3,
      car.z + Math.cos(car.yaw) * (1.5 + speed * 0.22)
    );
    desired.set(car.x, car.y + 1.2, car.z).add(offset);
    avoidBuildings(desired, colliders);
    if (!rig.initialized) {
      rig.pos.copy(desired);
      rig.look.copy(lookTarget);
      rig.initialized = true;
    } else {
      rig.pos.x = damp(rig.pos.x, desired.x, 7, dt);
      rig.pos.y = damp(rig.pos.y, desired.y, 7, dt);
      rig.pos.z = damp(rig.pos.z, desired.z, 7, dt);
      rig.look.x = damp(rig.look.x, lookTarget.x, 14, dt);
      rig.look.y = damp(rig.look.y, lookTarget.y, 14, dt);
      rig.look.z = damp(rig.look.z, lookTarget.z, 14, dt);
    }
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
  };

  // Fixed cinematic poses used by the screenshot hook.
  rig.pose = function (mode, target, car) {
    rig.initialized = true;
    if (mode === 'chase') {
      const t = car || target;
      const yaw = car ? car.yaw : rig.yaw + Math.PI;
      rig.pos.set(t.x - Math.sin(yaw) * 9, (t.y || 0) + 3.4, t.z - Math.cos(yaw) * 9);
      rig.look.set(t.x + Math.sin(yaw) * 4, (t.y || 0) + 1.2, t.z + Math.cos(yaw) * 4);
      rig.yaw = yaw + Math.PI;
    } else if (mode === 'high') {
      rig.pos.set(target.x - 30, 70, target.z + 70);
      rig.look.set(target.x, 0, target.z);
    } else if (mode === 'coast') {
      rig.pos.set(235, 26, 70);
      rig.look.set(40, 8, -10);
    } else if (mode === 'front') {
      rig.pos.set(target.x - Math.sin(rig.yaw) * 5, target.y + 2.2, target.z - Math.cos(rig.yaw) * 5);
      rig.look.set(target.x, target.y + 1.4, target.z);
    } else { // 'follow' — snap the orbit behind the player
      lookTarget.set(target.x, target.y + C.lookHeight, target.z);
      orbit(offset, C.distance);
      rig.pos.copy(lookTarget).add(offset);
      rig.look.copy(lookTarget);
    }
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);
  };

  return rig;
}
