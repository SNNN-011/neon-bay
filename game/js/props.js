// Neon Bay — street props: palm trees, street lamps and parked cars.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeBox, pick, randRange } from './util.js';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();
const up = new THREE.Vector3(0, 1, 0);

function finish(mesh, { shadow = false, receive = false } = {}) {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  return mesh;
}

// palms: [{ x, z, scale, leanX, leanZ }]
export function createPalms(scene, palms, rng) {
  const trunkGeo = new THREE.CylinderGeometry(0.13, 0.26, 5, 6);
  trunkGeo.translate(0, 2.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x9a6b4f, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);

  const frondGeo = new THREE.BoxGeometry(0.34, 0.06, 3.1);
  frondGeo.translate(0, 0, 1.55);
  const frondMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palms.length * 6);

  const q = new THREE.Quaternion();
  const top = new THREE.Vector3();
  let fi = 0;
  for (let i = 0; i < palms.length; i++) {
    const p = palms[i];
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(p.leanX, randRange(rng, 0, Math.PI * 2), p.leanZ);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    trunks.setColorAt(i, tmpColor.setHex(0x9a6b4f).multiplyScalar(randRange(rng, 0.85, 1.1)));

    q.setFromEuler(dummy.rotation);
    top.set(0, 5, 0).applyQuaternion(q).multiplyScalar(p.scale).add(dummy.position);
    for (let k = 0; k < 6; k++) {
      dummy.position.copy(top);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(randRange(rng, 0.3, 0.6), (k / 6) * Math.PI * 2 + randRange(rng, -0.2, 0.2), 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      fronds.setMatrixAt(fi, dummy.matrix);
      fronds.setColorAt(fi, tmpColor.setHex(0x4f9e56).multiplyScalar(randRange(rng, 0.8, 1.2)));
      fi++;
    }
    dummy.rotation.order = 'XYZ';
  }
  scene.add(finish(trunks, { shadow: true }));
  scene.add(finish(fronds, { shadow: true }));
  return { meshes: [trunks, fronds] };
}

// lamps: [{ x, z, yaw }] — yaw points the cantilever arm over the road.
export function createLamps(scene, lamps) {
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 5.4, 6);
  poleGeo.translate(0, 2.7, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d3a52, roughness: 0.6, metalness: 0.5 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lamps.length);

  const headGeo = new THREE.BoxGeometry(1.7, 0.16, 0.3);
  headGeo.translate(0.75, 0, 0);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe6ad });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);

  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    dummy.position.set(l.x, 0, l.z);
    dummy.rotation.set(0, l.yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(l.x, 5.35, l.z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  }
  scene.add(finish(poles, { shadow: true }));
  scene.add(finish(heads));
  return { meshes: [poles, heads] };
}

// cars: [{ x, z, color }] — parked along the z axis in parking lots.
export function createParkedCars(scene, cars, rng) {
  const colliders = [];
  const bodyGeo = new THREE.BoxGeometry(1.9, 0.6, 4.3);
  bodyGeo.translate(0, 0.62, 0);
  const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.1);
  cabinGeo.translate(0, 1.18, -0.2);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const paint = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x27304a, roughness: 0.2, metalness: 0.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c1a24, roughness: 0.95 });

  const bodies = new THREE.InstancedMesh(bodyGeo, paint, cars.length);
  const cabins = new THREE.InstancedMesh(cabinGeo, glass, cars.length);
  const wheels = new THREE.InstancedMesh(wheelGeo, rubber, cars.length * 4);

  let wi = 0;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(c.x, 0.15, c.z);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    bodies.setColorAt(i, tmpColor.setHex(c.color));
    cabins.setMatrixAt(i, dummy.matrix);
    for (const [ox, oz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      dummy.position.set(c.x + ox, 0.49, c.z + oz);
      dummy.updateMatrix();
      wheels.setMatrixAt(wi++, dummy.matrix);
    }
    colliders.push(makeBox(c.x, c.z, 2.1, 4.5, 1.6));
  }
  scene.add(finish(bodies, { shadow: true, receive: true }));
  scene.add(finish(cabins, { shadow: true }));
  scene.add(finish(wheels));
  return { colliders, meshes: [bodies, cabins, wheels] };
}

export function randomCarColor(rng) {
  return pick(rng, CONFIG.palette.cars);
}
