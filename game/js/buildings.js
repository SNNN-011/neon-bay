// Neon Bay — art-deco building factory. Pastel bodies with stepped tops,
// neon trim bands, lit window grids and storefront glow — all instanced so
// the whole skyline costs a handful of draw calls.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeBox, pick, randRange } from './util.js';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

// spec: { x, z, w, d, h, color, trim, neon }
export function createBuildings(scene, specs, rng) {
  const colliders = [];
  const n = specs.length;
  const P = CONFIG.palette;

  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02 });
  const trimMat = new THREE.MeshBasicMaterial();           // unlit bands read as neon trim
  const winMat = new THREE.MeshBasicMaterial();            // unlit windows = emissive look
  // toneMapped:false keeps signs at full saturation — ACES would otherwise
  // wash the tubes out against the pastel facades.
  const neonMat = new THREE.MeshBasicMaterial({ toneMapped: false });

  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bodies = new THREE.InstancedMesh(unit, bodyMat, n);
  const tops = new THREE.InstancedMesh(unit, bodyMat, n);
  const trims = new THREE.InstancedMesh(unit, trimMat, n);

  const windows = [];   // { x, y, z, yaw, lit }
  const signs = [];     // { x, y, z, yaw, w, h, color }

  for (let i = 0; i < n; i++) {
    const s = specs[i];
    const topH = s.h * randRange(rng, 0.18, 0.3);
    const topW = s.w * 0.62, topD = s.d * 0.62;

    dummy.rotation.set(0, 0, 0);
    dummy.position.set(s.x, s.h / 2, s.z);
    dummy.scale.set(s.w, s.h, s.d);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, tmpColor.setHex(s.color));

    dummy.position.set(s.x, s.h + topH / 2, s.z);
    dummy.scale.set(topW, topH, topD);
    dummy.updateMatrix();
    tops.setMatrixAt(i, dummy.matrix);
    tops.setColorAt(i, tmpColor.setHex(s.color).multiplyScalar(0.94));

    dummy.position.set(s.x, s.h - 0.35, s.z);
    dummy.scale.set(s.w + 0.35, 0.7, s.d + 0.35);
    dummy.updateMatrix();
    trims.setMatrixAt(i, dummy.matrix);
    trims.setColorAt(i, tmpColor.setHex(s.trim));

    colliders.push(makeBox(s.x, s.z, s.w, s.d, s.h + topH));

    // Window grid on all four faces; the storefront floor stays clear.
    const faces = [
      { yaw: 0, nx: 0, nz: 1, fw: s.w },
      { yaw: Math.PI, nx: 0, nz: -1, fw: s.w },
      { yaw: Math.PI / 2, nx: 1, nz: 0, fw: s.d },
      { yaw: -Math.PI / 2, nx: -1, nz: 0, fw: s.d },
    ];
    const floors = Math.max(1, Math.floor((s.h - 3.2) / 3));
    for (const f of faces) {
      const cols = Math.max(1, Math.floor((f.fw - 2) / 2.4));
      for (let fl = 0; fl < floors; fl++) {
        const y = 3.4 + fl * 3;
        if (y > s.h - 1.2) break;
        for (let c = 0; c < cols; c++) {
          const t = (c + 0.5) / cols - 0.5;
          const px = s.x + f.nx * (s.w / 2 + 0.06) + (f.nz !== 0 ? t * (s.w - 2.4) : 0);
          const pz = s.z + f.nz * (s.d / 2 + 0.06) + (f.nx !== 0 ? t * (s.d - 2.4) : 0);
          windows.push({ x: px, y, z: pz, yaw: f.yaw, lit: rng() < 0.62 });
        }
      }
      // Warm storefront strip hugging street level on every face.
      signs.push({ x: s.x + f.nx * (s.w / 2 + 0.08), y: 1.7, z: s.z + f.nz * (s.d / 2 + 0.08), yaw: f.yaw, w: f.fw * 0.8, h: 0.5, color: 0xffd98c });
    }

    if (s.neon) {
      const f = faces[Math.floor(rng() * 4) % 4];
      const col = pick(rng, P.neon);
      signs.push({
        x: s.x + f.nx * (s.w / 2 + 0.22), y: randRange(rng, 5, Math.min(10, s.h - 2)),
        z: s.z + f.nz * (s.d / 2 + 0.22), yaw: f.yaw,
        w: Math.min(f.fw * 0.7, 5), h: 1.3, color: col,
      });
      // Vertical deco tube wrapping one corner.
      signs.push({ x: s.x + s.w / 2 + 0.18, y: s.h * 0.55, z: s.z + s.d / 2 + 0.18, yaw: Math.PI / 4, w: 0.4, h: s.h * 0.62, color: pick(rng, P.neon) });
    }
  }

  const winMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.5, 0.08), winMat, windows.length);
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    dummy.position.set(w.x, w.y, w.z);
    dummy.rotation.set(0, w.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    winMesh.setMatrixAt(i, dummy.matrix);
    if (w.lit) tmpColor.setHex(0xffd98c).multiplyScalar(randRange(rng, 0.7, 1.15));
    else tmpColor.setHex(0x2a2440);
    winMesh.setColorAt(i, tmpColor);
  }

  const signMesh = new THREE.InstancedMesh(unit, neonMat, signs.length);
  for (let i = 0; i < signs.length; i++) {
    const s = signs[i];
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, s.yaw, 0);
    dummy.scale.set(s.w, s.h, 0.18);
    dummy.updateMatrix();
    signMesh.setMatrixAt(i, dummy.matrix);
    signMesh.setColorAt(i, tmpColor.setHex(s.color).multiplyScalar(1.6));
  }

  for (const m of [bodies, tops, trims, winMesh, signMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.frustumCulled = false;
    scene.add(m);
  }
  bodies.castShadow = true; bodies.receiveShadow = true;
  tops.castShadow = true;
  trims.castShadow = false;

  return { colliders, meshes: [bodies, tops, trims, winMesh, signMesh] };
}
