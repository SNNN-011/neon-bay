// Neon Bay — Riko, the player character: low-poly humanoid, on-foot movement
// (WASD + sprint + jump), gravity, static collision and a simple walk cycle.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, dampAngle, resolveCircleVsBoxes } from './util.js';

const P = CONFIG.player;

export function createPlayer(scene) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2fb7a6, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x35304f, roughness: 0.85 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x241c2e, roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.7 });

  function part(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  }

  // Limb geometries pivot at the hip / shoulder so rotation swings naturally.
  const legGeo = new THREE.BoxGeometry(0.22, 0.78, 0.24);
  legGeo.translate(0, -0.39, 0);
  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.18);
  armGeo.translate(0, -0.31, 0);

  const legL = part(legGeo, pants, -0.13, 0.78, 0);
  const legR = part(legGeo, pants, 0.13, 0.78, 0);
  const shoeGeo = new THREE.BoxGeometry(0.24, 0.1, 0.32);
  const shoeL = new THREE.Mesh(shoeGeo, shoe);
  shoeL.position.set(0, -0.73, 0.05);
  shoeL.castShadow = true;
  legL.add(shoeL);
  const shoeR = new THREE.Mesh(shoeGeo, shoe);
  shoeR.position.set(0, -0.73, 0.05);
  shoeR.castShadow = true;
  legR.add(shoeR);
  part(new THREE.BoxGeometry(0.5, 0.62, 0.28), shirt, 0, 1.12, 0);
  const armL = part(armGeo, shirt, -0.33, 1.4, 0);
  const armR = part(armGeo, shirt, 0.33, 1.4, 0);
  part(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin, 0, 1.62, 0);
  part(new THREE.BoxGeometry(0.32, 0.12, 0.32), hair, 0, 1.8, -0.01);

  scene.add(group);

  const player = {
    group,
    pos: new THREE.Vector3(P.spawn.x, 0, P.spawn.z),
    vy: 0,
    yaw: Math.PI,
    grounded: true,
    walkPhase: 0,
    speedNow: 0,
  };
  player.pos.y = 0;

  player.teleport = function (x, z, groundHeightAt) {
    player.pos.set(x, groundHeightAt(x, z), z);
    player.vy = 0;
    player.grounded = true;
  };

  player.update = function (dt, ctx) {
    const { input, cameraYaw, colliders, groundHeightAt, clampToWorld, state } = ctx;

    // Camera-relative wish direction.
    const fx = -Math.sin(cameraYaw), fz = -Math.cos(cameraYaw);
    const rx = -fz, rz = fx;
    let wx = 0, wz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) { wx += fx; wz += fz; }
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) { wx -= fx; wz -= fz; }
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) { wx += rx; wz += rz; }
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { wx -= rx; wz -= rz; }
    const len = Math.hypot(wx, wz);
    const moving = len > 0.01;
    if (moving) { wx /= len; wz /= len; }
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = moving ? (sprint ? P.sprintSpeed : P.walkSpeed) : 0;
    player.speedNow = speed;

    player.pos.x += wx * speed * dt;
    player.pos.z += wz * speed * dt;
    resolveCircleVsBoxes(player.pos, P.radius, colliders);
    clampToWorld(player.pos);

    // Vertical: jump, gravity, ground snap with small auto-step.
    const ground = groundHeightAt(player.pos.x, player.pos.z);
    if (player.grounded && input.isDown('Space')) {
      player.vy = P.jumpSpeed;
      player.grounded = false;
    }
    if (!player.grounded) {
      player.vy -= P.gravity * dt;
      player.pos.y += player.vy * dt;
      if (player.pos.y <= ground) {
        player.pos.y = ground;
        player.vy = 0;
        player.grounded = true;
      }
    } else if (ground > player.pos.y && ground - player.pos.y <= 0.4) {
      player.pos.y = ground;
    } else if (ground < player.pos.y - 0.05) {
      player.grounded = false; // walked off a curb / pier edge
      player.vy = 0;
    }

    // Face the movement direction and animate the walk cycle.
    if (moving) player.yaw = dampAngle(player.yaw, Math.atan2(wx, wz), 12, dt);
    group.rotation.y = player.yaw;
    group.position.copy(player.pos);

    const stride = speed > 0 ? (sprint ? 11 : 7.5) : 0;
    player.walkPhase += stride * dt;
    const swing = moving ? Math.sin(player.walkPhase) * (sprint ? 0.85 : 0.6) : 0;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    armL.rotation.x = -swing * 0.8;
    armR.rotation.x = swing * 0.8;

    state.player.x = player.pos.x;
    state.player.y = player.pos.y;
    state.player.z = player.pos.z;
    state.player.yaw = player.yaw;
    state.player.grounded = player.grounded;
    state.player.speed = speed;
  };

  return player;
}
