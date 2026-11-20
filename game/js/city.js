// Neon Bay — city layout: road grid, sidewalks, downtown blocks, alleys, plazas, beach, ocean and pier.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { mulberry32, randRange, pick, makeBox } from './util.js';
import { createBuildings } from './buildings.js';
import { createPalms, createLamps, createParkedCars, randomCarColor } from './props.js';

const C = CONFIG.city;
const P = CONFIG.palette;
const dummy = new THREE.Object3D();

function instancedBoxes(scene, geoW, geoH, geoD, mat, items, opts = {}) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(geoW, geoH, geoD), mat, items.length);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.yaw || 0, 0);
    dummy.scale.set(it.sx || 1, it.sy || 1, it.sz || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, new THREE.Color(it.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.castShadow = !!opts.shadow;
  mesh.receiveShadow = !!opts.receive;
  scene.add(mesh);
  return mesh;
}

export function buildCity(scene) {
  const rng = mulberry32(20261120);
  const colliders = [];
  const lines = [];
  for (let i = -C.gridHalf; i <= C.gridHalf; i++) lines.push(i * C.blockPitch);
  const cellCenters = [];
  for (let i = 0; i < C.gridHalf * 2; i++) cellCenters.push(-100 + i * C.blockPitch);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(640, 1, 640),
    new THREE.MeshStandardMaterial({ color: 0x93887a, roughness: 1 })
  );
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(C.oceanStart - C.beachStart, 0.16, 320),
    new THREE.MeshStandardMaterial({ color: P.sand, roughness: 1 })
  );
  sand.position.set((C.beachStart + C.oceanStart) / 2, 0, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.BoxGeometry(440, 0.6, 660),
    // low metalness + faint emissive: without an env map, metal water goes
    // black at grazing angles; this keeps the bay teal through golden hour.
    new THREE.MeshStandardMaterial({ color: 0x37b4cc, roughness: 0.18, metalness: 0.02, emissive: 0x0a3d4a, emissiveIntensity: 0.4 })
  );
  // waterline sits ABOVE the ground slab (top y=0) or the bay renders as
  // bare dirt; 0.06 keeps it just under the sand lip (0.08).
  ocean.position.set(C.oceanStart + 220, -0.24, 0);
  scene.add(ocean);

  const foam = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.1, 320),
    new THREE.MeshBasicMaterial({ color: 0xf7f3e8 })
  );
  foam.position.set(C.oceanStart, 0.07, 0);
  scene.add(foam);

  const asphaltMat = new THREE.MeshStandardMaterial({ color: P.asphalt, roughness: 0.95 });
  const roadItems = [];
  for (const x of lines) roadItems.push({ x, y: 0.04, z: 0, sx: C.roadWidth, sy: 0.08, sz: C.cityEdge * 2 });
  for (const z of lines) {
    for (let i = 0; i < lines.length - 1; i++) {
      const cx = (lines[i] + lines[i + 1]) / 2;
      roadItems.push({ x: cx, y: 0.04, z, sx: C.blockPitch - C.roadWidth, sy: 0.08, sz: C.roadWidth });
    }
  }
  instancedBoxes(scene, 1, 1, 1, asphaltMat, roadItems, { receive: true });

  const dashItems = [];
  const nearLine = (v) => lines.some((l) => Math.abs(v - l) < 9);
  for (const x of lines) {
    for (let z = -128; z <= 128; z += 5) {
      if (!nearLine(z)) dashItems.push({ x, y: 0.085, z, sx: 0.18, sy: 0.02, sz: 2.2, color: P.lane });
    }
  }
  for (const z of lines) {
    for (let x = -128; x <= 128; x += 5) {
      if (!nearLine(x)) dashItems.push({ x, y: 0.085, z, sx: 0.18, sy: 0.02, sz: 2.2, yaw: Math.PI / 2, color: P.lane });
    }
  }
  instancedBoxes(scene, 1, 1, 1, new THREE.MeshBasicMaterial(), dashItems);

  const walkItems = [];
  for (const ix of lines) for (const iz of lines) {
    for (let k = 0; k < 6; k++) {
      const t = -4.5 + k * 1.8;
      walkItems.push({ x: ix + t, y: 0.085, z: iz - 8.2, sx: 0.55, sy: 0.02, sz: 2.4, color: P.crosswalk });
      walkItems.push({ x: ix + t, y: 0.085, z: iz + 8.2, sx: 0.55, sy: 0.02, sz: 2.4, color: P.crosswalk });
      walkItems.push({ x: ix - 8.2, y: 0.085, z: iz + t, sx: 0.55, sy: 0.02, sz: 2.4, yaw: Math.PI / 2, color: P.crosswalk });
      walkItems.push({ x: ix + 8.2, y: 0.085, z: iz + t, sx: 0.55, sy: 0.02, sz: 2.4, yaw: Math.PI / 2, color: P.crosswalk });
    }
  }
  instancedBoxes(scene, 1, 1, 1, new THREE.MeshBasicMaterial(), walkItems);

  const plinthItems = [];
  const specs = [];
  const palms = [];
  const parkedCars = [];
  const stallItems = [];
  const plazaCells = new Set(['2,2', '3,4']);
  const cellKind = {};

  for (let i = 0; i < cellCenters.length; i++) {
    for (let j = 0; j < cellCenters.length; j++) {
      const cx = cellCenters[i], cz = cellCenters[j];
      plinthItems.push({ x: cx, y: 0.06, z: cz, sx: 28, sy: 0.12, sz: 28, color: P.sidewalk });
      const key = `${i},${j}`;
      let kind = 'building';
      if (plazaCells.has(key)) kind = 'plaza';
      else if ((i * 7 + j * 11) % 9 === 0) kind = 'parking';
      else if ((i + j) % 3 === 1) kind = 'alley';
      cellKind[key] = kind;

      const downtown = 1 - Math.hypot(cx, cz) / 145;
      const height = () => Math.max(8, 9 + downtown * 28 + randRange(rng, 0, 9));
      const color = () => pick(rng, P.buildings);
      const trim = () => pick(rng, P.trims);

      if (kind === 'building') {
        const w = randRange(rng, 14, 19), d = randRange(rng, 14, 19);
        const h = height();
        specs.push({ x: cx, z: cz, w, d, h, color: color(), trim: trim(), neon: h > 12 && rng() < 0.6 });
      } else if (kind === 'alley') {
        for (const side of [-1, 1]) {
          const h = height() * randRange(rng, 0.7, 1);
          specs.push({ x: cx + side * 6.75, z: cz, w: 8.5, d: 19, h, color: color(), trim: trim(), neon: rng() < 0.45 });
        }
      } else if (kind === 'parking') {
        stallItems.push({ x: cx, y: 0.14, z: cz, sx: 22, sy: 0.04, sz: 22, color: 0x4a4556 });
        for (const ox of [-8, 0, 8]) stallItems.push({ x: cx + ox, y: 0.165, z: cz, sx: 0.12, sy: 0.02, sz: 13, color: P.crosswalk });
        for (const ox of [-4, 4]) for (const oz of [-5, 5]) {
          if (rng() < 0.85) parkedCars.push({ x: cx + ox, z: cz + oz, color: randomCarColor(rng) });
        }
      } else if (kind === 'plaza') {
        stallItems.push({ x: cx, y: 0.14, z: cz, sx: 22, sy: 0.04, sz: 22, color: P.grass });
        for (const ox of [-8, 8]) for (const oz of [-8, 8]) {
          palms.push({ x: cx + ox, z: cz + oz, scale: randRange(rng, 0.8, 1.1), leanX: randRange(rng, -0.08, 0.08), leanZ: randRange(rng, -0.08, 0.08) });
        }
        const basin = new THREE.Mesh(
          new THREE.CylinderGeometry(3, 3.4, 0.6, 16),
          new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: 0.8 })
        );
        basin.position.set(cx, 0.42, cz);
        basin.castShadow = true;
        scene.add(basin);
        const water = new THREE.Mesh(new THREE.CircleGeometry(2.7, 16), new THREE.MeshBasicMaterial({ color: 0x5fd6e8 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, 0.73, cz);
        scene.add(water);
        colliders.push(makeBox(cx, cz, 6.8, 6.8, 0.8));
      }
    }
  }
  instancedBoxes(scene, 1, 1, 1, new THREE.MeshStandardMaterial({ roughness: 0.95 }), plinthItems, { receive: true });
  instancedBoxes(scene, 1, 1, 1, new THREE.MeshStandardMaterial({ roughness: 0.95 }), stallItems, { receive: true });

  const buildings = createBuildings(scene, specs, rng);
  colliders.push(...buildings.colliders);

  const pier = C.pier;
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xb08a63, roughness: 0.9 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(pier.x1 - pier.x0, 0.2, pier.halfWidth * 2), woodMat);
  deck.position.set((pier.x0 + pier.x1) / 2, pier.deckY - 0.1, pier.z);
  deck.castShadow = true; deck.receiveShadow = true;
  scene.add(deck);
  const stepMat = new THREE.MeshStandardMaterial({ color: 0xc4a179, roughness: 0.9 });
  for (const [sx, top] of [[147, 0.17], [149, 0.34]]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(2, top, pier.halfWidth * 2), stepMat);
    step.position.set(sx, top / 2, pier.z);
    step.receiveShadow = true;
    scene.add(step);
  }
  const pillarItems = [];
  for (let x = pier.x0 + 6; x <= pier.x1 - 2; x += 12) {
    for (const oz of [-3.2, 3.2]) pillarItems.push({ x, y: -0.8, z: pier.z + oz });
  }
  const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.26, 2.6, 8), woodMat, pillarItems.length);
  pillarItems.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
    dummy.updateMatrix(); pillars.setMatrixAt(i, dummy.matrix);
  });
  pillars.instanceMatrix.needsUpdate = true; pillars.frustumCulled = false; pillars.castShadow = true;
  scene.add(pillars);
  for (const oz of [-3.9, 3.9]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(pier.x1 - pier.x0, 0.1, 0.12), woodMat);
    rail.position.set((pier.x0 + pier.x1) / 2, 1.3, pier.z + oz);
    scene.add(rail);
  }

  for (let z = -140; z <= 140; z += 16) {
    palms.push({ x: 134 + randRange(rng, -2, 2), z, scale: randRange(rng, 0.85, 1.25), leanX: randRange(rng, -0.1, 0.1), leanZ: randRange(rng, -0.12, 0.02) });
  }
  for (const oz of [-12, 12]) palms.push({ x: 142, z: oz, scale: 1.1, leanX: 0.05, leanZ: -0.08 });
  createPalms(scene, palms, rng);

  const lamps = [];
  for (const l of lines) {
    for (let t = -116; t <= 116; t += 29) {
      lamps.push({ x: l + 7.3, z: t, yaw: Math.PI });
      lamps.push({ x: l - 7.3, z: t, yaw: 0 });
      lamps.push({ x: t, z: l + 7.3, yaw: Math.PI / 2 });
      lamps.push({ x: t, z: l - 7.3, yaw: -Math.PI / 2 });
    }
  }
  createLamps(scene, lamps);

  const cars = createParkedCars(scene, parkedCars, rng);
  colliders.push(...cars.colliders);

  function groundHeightAt(x, z) {
    if (Math.abs(z - pier.z) <= pier.halfWidth) {
      if (x >= pier.x0 && x <= pier.x1) return pier.deckY;
      if (x >= 148 && x < pier.x0) return 0.34;
      if (x >= 146 && x < 148) return 0.17;
    }
    for (let i = 0; i < cellCenters.length; i++) {
      for (let j = 0; j < cellCenters.length; j++) {
        if (Math.abs(x - cellCenters[i]) <= 14 && Math.abs(z - cellCenters[j]) <= 14) {
          const kind = cellKind[`${i},${j}`];
          return kind === 'parking' || kind === 'plaza' ? 0.16 : 0.12;
        }
      }
    }
    if (x >= C.beachStart && x <= C.oceanStart) return 0.08;
    return 0;
  }

  function clampToWorld(pos) {
    pos.x = Math.max(C.worldMinX, Math.min(C.worldMaxX, pos.x));
    pos.z = Math.max(C.worldMinZ, Math.min(C.worldMaxZ, pos.z));
    const onPier = Math.abs(pos.z - pier.z) <= pier.halfWidth && pos.x >= 146;
    if (pos.x > C.oceanStart - 0.6 && !onPier) pos.x = C.oceanStart - 0.6;
    if (onPier && pos.x > pier.x1) pos.x = pier.x1;
  }

  return {
    colliders,
    groundHeightAt,
    clampToWorld,
    roads: { lines, width: C.roadWidth, edge: C.cityEdge },
    cellCenters,
    cellKind,
    pier,
  };
}
