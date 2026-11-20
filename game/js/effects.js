// Neon Bay — stylized effects: pooled skid decals, particles, tracers and muzzle flashes.

import * as THREE from 'three';

const MAX_SKID = 160;
const MAX_PART = 100;
const MAX_TRACER = 24;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const zero = new THREE.Matrix4().makeScale(0, 0, 0);

export function createEffects(scene, city) {
  const unit = new THREE.BoxGeometry(1, 1, 1);

  const skids = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: 0x26222e, transparent: true, opacity: 0.5 }), MAX_SKID);
  const parts = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial(), MAX_PART);
  const tracers = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), MAX_TRACER);
  for (const m of [skids, parts, tracers]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
    for (let i = 0; i < m.count; i++) m.setMatrixAt(i, zero);
  }
  const flash = new THREE.PointLight(0xffd9a0, 0, 16, 2);
  scene.add(flash);

  let skidAt = 0;
  const pool = [];
  for (let i = 0; i < MAX_PART; i++) pool.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, ttl: 1, size: 0.2, g: -9 });
  const beams = [];
  for (let i = 0; i < MAX_TRACER; i++) beams.push({ on: false, life: 0, x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0 });

  const fx = {
    skidCount: 0,
    // Two rear-wheel marks; the ring buffer overwrites the oldest rubber.
    skid(x, z, yaw) {
      fx.skidCount += 2;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      for (const side of [-0.8, 0.8]) {
        const lx = side, lz = -1.3;
        dummy.position.set(x + lx * c + lz * s, city.groundHeightAt(x, z) + 0.095, z - lx * s + lz * c);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(0.24, 0.02, 1.1);
        dummy.updateMatrix();
        skids.setMatrixAt(skidAt, dummy.matrix);
        skidAt = (skidAt + 1) % MAX_SKID;
      }
      skids.instanceMatrix.needsUpdate = true;
    },
    burst(x, y, z, o) {
      const n = o.n || 6;
      for (let k = 0; k < n; k++) {
        const p = pool.find((q) => !q.on);
        if (!p) return;
        const a = Math.random() * Math.PI * 2;
        const sp = (o.speed || 4) * (0.4 + Math.random() * 0.6);
        p.on = true;
        p.x = x; p.y = y; p.z = z;
        p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp;
        p.vy = (o.up !== undefined ? o.up : 2) * (0.5 + Math.random());
        p.ttl = p.life = (o.life || 0.5) * (0.7 + Math.random() * 0.6);
        p.size = o.size || 0.18;
        p.g = o.g !== undefined ? o.g : -9;
        parts.setColorAt(pool.indexOf(p), tmpColor.setHex(o.color || 0xffd98a));
      }
      if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    },
    smoke(x, y, z) {
      fx.burst(x, y, z, { n: 1, color: 0x8d8798, speed: 0.7, up: 1.6, size: 0.34, life: 1.1, g: 1.2 });
    },
    tracer(x1, y1, z1, x2, y2, z2) {
      const b = beams.find((q) => !q.on) || beams[0];
      b.on = true; b.life = 0.07;
      b.x1 = x1; b.y1 = y1; b.z1 = z1; b.x2 = x2; b.y2 = y2; b.z2 = z2;
    },
    flash(x, y, z) {
      flash.position.set(x, y, z);
      flash.intensity = 40;
    },
    update(dt) {
      flash.intensity *= Math.exp(-16 * dt);
      if (flash.intensity < 0.05) flash.intensity = 0;
      for (let i = 0; i < MAX_PART; i++) {
        const p = pool[i];
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; parts.setMatrixAt(i, zero); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const s = p.size * (p.life / p.ttl);
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.life * 4, p.life * 3, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        parts.setMatrixAt(i, dummy.matrix);
      }
      parts.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < MAX_TRACER; i++) {
        const b = beams[i];
        if (!b.on) continue;
        b.life -= dt;
        if (b.life <= 0) { b.on = false; tracers.setMatrixAt(i, zero); continue; }
        const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1, b.z2 - b.z1) || 0.01;
        dummy.position.set((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, (b.z1 + b.z2) / 2);
        dummy.lookAt(b.x2, b.y2, b.z2);
        dummy.scale.set(0.05, 0.05, len);
        dummy.updateMatrix();
        tracers.setMatrixAt(i, dummy.matrix);
      }
      tracers.instanceMatrix.needsUpdate = true;
    },
    reset() {
      for (let i = 0; i < MAX_PART; i++) { pool[i].on = false; parts.setMatrixAt(i, zero); }
      for (let i = 0; i < MAX_TRACER; i++) { beams[i].on = false; tracers.setMatrixAt(i, zero); }
      for (let i = 0; i < MAX_SKID; i++) skids.setMatrixAt(i, zero);
      skidAt = 0;
      fx.skidCount = 0;
      flash.intensity = 0;
      for (const m of [skids, parts, tracers]) m.instanceMatrix.needsUpdate = true;
    },
  };
  return fx;
}