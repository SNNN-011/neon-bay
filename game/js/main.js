// Neon Bay — boot + main loop. Wires renderer, golden-hour sky/lighting,
// city, player and camera together, and exposes the deterministic __NB hook
// (step/render without requestAnimationFrame) used for testing and capture.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, resolveCircleVsBoxes } from './util.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicleSystem } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPedestrians } from './pedestrians.js';
import { createEffects } from './effects.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';

const R = CONFIG.render;
const canvas = document.getElementById('game');

// ---- renderer -------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, R.pixelRatioCap));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(R.fogColor, R.fogNear, R.fogFar);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);

// ---- golden-hour sky dome --------------------------------------------------
const skyUniforms = {
  uTop: { value: new THREE.Color(R.skyTop) },
  uHorizon: { value: new THREE.Color(R.skyHorizon) },
  uSunDir: { value: new THREE.Vector3(0.55, 0.28, 0.35).normalize() },
  uSunColor: { value: new THREE.Color(0xffe9b8) },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(520, 24, 12),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
        float sun = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(sun, 260.0) * 1.4 + pow(sun, 8.0) * 0.3);
        if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.8, clamp(-d.y * 3.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
sky.frustumCulled = false;
scene.add(sky);

// ---- lights: one shadow-casting sun + cheap hemisphere fill ----------------
const hemi = new THREE.HemisphereLight(R.hemiSky, R.hemiGround, R.hemiIntensity);
scene.add(hemi);

const sun = new THREE.DirectionalLight(R.sunColor, R.sunIntensity);
sun.castShadow = true;
sun.shadow.mapSize.set(R.shadowMapSize, R.shadowMapSize);
sun.shadow.camera.left = -R.shadowRadius;
sun.shadow.camera.right = R.shadowRadius;
sun.shadow.camera.top = R.shadowRadius;
sun.shadow.camera.bottom = -R.shadowRadius;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
const sunOffset = new THREE.Vector3(70, 95, 45);

// ---- world + actors ---------------------------------------------------------
const city = buildCity(scene);
const input = createInput(canvas);
const player = createPlayer(scene);
const rig = createCameraRig(camera, input);
const vehicles = createVehicleSystem(scene, city);
const traffic = createTraffic(vehicles, city, 90210);
const peds = createPedestrians(scene, city, 4242);

// A few enterable cars near the spawn: one at the curb, two in parking lots.
function spawnStarterCars() {
  vehicles.spawn({ type: 'sport', color: 0xff5f9e, x: 4.6, z: 24, yaw: 0, kind: 'parked' });
  const lots = [];
  for (const key in city.cellKind) {
    if (city.cellKind[key] !== 'parking') continue;
    const [i, j] = key.split(',').map(Number);
    const cx = city.cellCenters[i], cz = city.cellCenters[j];
    lots.push({ cx, cz, d: Math.hypot(cx - CONFIG.player.spawn.x, cz - CONFIG.player.spawn.z) });
  }
  lots.sort((a, b) => a.d - b.d);
  for (const lot of lots.slice(0, 2)) {
    vehicles.spawn({ type: 'sedan', x: lot.cx, z: lot.cz, yaw: 0, kind: 'parked' });
  }
}
spawnStarterCars();

const state = {
  started: false,
  paused: false,
  mode: 'onfoot',
  time: 0,
  health: 100,
  armor: 0,
  cash: 0,
  wanted: 0,
  mission: -1,
  objective: '',
  vehicle: null, // { type, x, z, yaw, speed, stolen } while driving
  weapon: 'pistol',
  ammo: 24,
  down: null,    // 'busted' | 'wasted' while the respawn overlay is up
  downTimer: 0,
  player: { x: player.pos.x, y: 0, z: player.pos.z, yaw: player.yaw, grounded: true, speed: 0 },
};

// ---- law + combat systems (P3) ----------------------------------------------
const effects = createEffects(scene, city);
const wanted = createWanted(state);
const police = createPolice(scene, city, vehicles, peds, effects);
const combat = createCombat({
  scene, city, state, player, vehicles, peds, police, effects, input, camera, wanted, rig,
  canvas, exitVehicle: () => exitVehicle(),
});

// ---- HUD skeleton updates (later phases own the real HUD) -------------------
const hud = {
  health: document.getElementById('health-fill'),
  armor: document.getElementById('armor-fill'),
  cash: document.getElementById('cash'),
  stars: Array.from(document.querySelectorAll('#wanted .star')),
  objective: document.getElementById('objective'),
  speedo: document.getElementById('speedo'),
  hint: document.getElementById('hint'),
  start: document.getElementById('start-screen'),
  pause: document.getElementById('pause-screen'),
  weapon: document.getElementById('weapon'),
  crosshair: document.getElementById('crosshair'),
};

function updateHud() {
  hud.health.style.width = clamp(state.health, 0, 100) + '%';
  hud.armor.style.width = clamp(state.armor, 0, 100) + '%';
  hud.cash.textContent = '$' + state.cash.toLocaleString('en-US');
  hud.stars.forEach((s, i) => s.classList.toggle('lit', i < state.wanted));
  if (state.objective) {
    hud.objective.textContent = state.objective;
    hud.objective.style.display = 'block';
  } else {
    hud.objective.style.display = 'none';
  }
  const driving = state.mode === 'driving' && state.vehicle;
  hud.speedo.style.display = driving ? 'block' : 'none';
  const armed = state.started && !driving && !state.down;
  hud.weapon.style.display = armed ? 'block' : 'none';
  if (armed) hud.weapon.textContent = state.ammo > 0 ? 'PISTOL · ' + state.ammo : 'FISTS · find ammo';
  hud.crosshair.style.display = armed && !state.paused ? 'block' : 'none';
  if (driving) {
    hud.speedo.innerHTML = Math.round(Math.abs(state.vehicle.speed) * 3.6) + ' <small>km/h</small>';
    hud.hint.textContent = 'W/S gas & brake · A/D steer · Space handbrake · E exit';
  } else {
    const near = vehicles.nearestEnterable(player.pos.x, player.pos.z, CONFIG.vehicle.enterDist);
    hud.hint.textContent = near
      ? 'Press E to enter the ' + near.type + (near.kind === 'traffic' ? ' (steal)' : '')
      : 'WASD move · Shift sprint · Space jump · mouse look';
  }
}

// ---- enter / exit vehicles ----------------------------------------------------
function enterVehicle(v) {
  if (v.kind === 'traffic') { v.stolen = true; wanted.crime(12); } // carjacking = 1 star
  v.ai = null;
  v.stun = 0;
  v.occupied = true;
  v.kind = 'player';
  vehicles.playerCar = v;
  vehicles.attachPlayerMesh(v);
  state.mode = 'driving';
  state.vehicle = { type: v.type, x: v.x, z: v.z, yaw: v.yaw, speed: 0, stolen: v.stolen };
  player.group.visible = false;
  player.knockX = player.knockZ = 0;
  rig.initialized = false;
}

function exitVehicle() {
  const v = vehicles.playerCar;
  if (!v) return;
  const s = v.spec;
  // Step out on the left side; resolve against the world (not our own car).
  const lx = -(s.wid / 2 + 0.9);
  const pos = {
    x: v.x + lx * Math.cos(v.yaw),
    z: v.z - lx * Math.sin(v.yaw),
  };
  const boxes = city.colliders.concat(vehicles.carBoxes.filter((b) => {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    return Math.hypot(cx - v.x, cz - v.z) > 0.5;
  }));
  resolveCircleVsBoxes(pos, CONFIG.player.radius, boxes);
  city.clampToWorld(pos);
  player.pos.set(pos.x, city.groundHeightAt(pos.x, pos.z), pos.z);
  player.vy = 0;
  player.grounded = true;
  player.yaw = v.yaw;
  player.group.visible = true;
  v.occupied = false;
  v.kind = 'parked';
  v.vx = v.vz = v.speed = 0;
  vehicles.detachPlayerMesh(v);
  vehicles.playerCar = null;
  state.mode = 'onfoot';
  state.vehicle = null;
  rig.initialized = false;
}

let prevE = false;
function handleEnterExit() {
  if (state.mode === 'driving') { exitVehicle(); return; }
  const v = vehicles.nearestEnterable(player.pos.x, player.pos.z, CONFIG.vehicle.enterDist);
  if (v) enterVehicle(v);
}

// ---- simulation step (shared by the rAF loop and the __NB hook) -------------
function step(dt) {
  dt = clamp(dt, 0, 0.05);
  state.time += dt;
  if (!state.paused) {
    const ctx = { city, input, state, player, vehicles, peds, time: state.time, police, combat, wanted, effects };
    traffic.update(dt, ctx);
    vehicles.update(dt, ctx);
    peds.update(dt, ctx);
    combat.update(dt, ctx);
    police.update(dt, ctx);
    wanted.update(dt, ctx);
    effects.update(dt);

    const eDown = input.isDown('KeyE');
    if (eDown && !prevE && state.started && !state.down) handleEnterExit();
    prevE = eDown;

    if (state.mode === 'driving' && vehicles.playerCar) {
      const v = vehicles.playerCar;
      player.pos.set(v.x, v.y, v.z);
      state.player.x = v.x; state.player.y = v.y; state.player.z = v.z;
      state.player.yaw = v.yaw; state.player.grounded = true;
      state.player.speed = Math.hypot(v.vx, v.vz);
      state.vehicle.x = v.x; state.vehicle.z = v.z;
      state.vehicle.yaw = v.yaw; state.vehicle.speed = v.speed;
      rig.updateChase(dt, v, city.colliders);
    } else {
      if (!state.down) {
        player.update(dt, {
          input,
          cameraYaw: rig.yaw,
          colliders: city.colliders.concat(vehicles.carBoxes),
          groundHeightAt: city.groundHeightAt,
          clampToWorld: city.clampToWorld,
          state,
        });
      }
      rig.update(dt, player.pos, city.colliders);
    }
  }
  // Keep the shadow frustum and sky centered on the focus (player or car).
  const focus = state.mode === 'driving' && vehicles.playerCar ? vehicles.playerCar : player.pos;
  sun.position.set(focus.x + sunOffset.x, focus.y + sunOffset.y, focus.z + sunOffset.z);
  sun.target.position.set(focus.x, focus.y, focus.z);
  sun.target.updateMatrixWorld();
  sky.position.set(camera.position.x, 0, camera.position.z);
  updateHud();
}

function render() {
  renderer.render(scene, camera);
}

// ---- normal play loop --------------------------------------------------------
let last = performance.now();
let autoLoop = true;
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  step(dt);
  render();
  if (autoLoop) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- start / pause flow -------------------------------------------------------
function startGame() {
  state.started = true;
  state.paused = false;
  hud.start.classList.add('hidden');
  hud.pause.classList.add('hidden');
  if (canvas.requestPointerLock) {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
}
document.getElementById('btn-new').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', () => {
  state.paused = false;
  hud.pause.classList.add('hidden');
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && state.started) {
    state.paused = !state.paused;
    hud.pause.classList.toggle('hidden', !state.paused);
  }
});

// ---- deterministic hook (headless testing + screenshot capture) ---------------
window.__NB = {
  step,
  render,
  teleport(x, z) {
    if (state.mode === 'driving' && vehicles.playerCar) {
      const v = vehicles.playerCar;
      v.x = x; v.z = z; v.y = city.groundHeightAt(x, z);
      v.vx = v.vz = v.speed = 0;
      player.pos.set(x, v.y, z);
    } else {
      player.teleport(x, z, city.groundHeightAt);
    }
    state.player.x = x; state.player.z = z;
    rig.initialized = false;
  },
  spawnCarNear(x, z) {
    const px = x !== undefined ? x : player.pos.x;
    const pz = z !== undefined ? z : player.pos.z;
    const v = vehicles.spawn({ type: 'sedan', x: px + 3, z: pz, yaw: 0, kind: 'parked' });
    return v ? { id: v.id, type: v.type, x: v.x, z: v.z } : null;
  },
  enterNearestCar() {
    if (state.mode === 'driving') return true;
    const v = vehicles.nearestEnterable(player.pos.x, player.pos.z, 8);
    if (v) { enterVehicle(v); return true; }
    return false;
  },
  setWanted(n) {
    wanted.set(n);
    updateHud();
  },
  // P3 test helpers: deterministic combat / damage / pickup access.
  fireWeapon() { return combat.fireWeapon(); },
  attack() { combat.attack(); },
  damagePlayer(n, source) { combat.damagePlayer(n, source || 'world'); },
  collectPickups() { return combat.collectPickups(); },
  startMission(i) {
    state.mission = i;                          // P4 wires real mission logic
    state.objective = 'Mission ' + i + ' (stub — story arrives in P4)';
    updateHud();
  },
  poseCamera(mode) {
    const focus = state.mode === 'driving' && vehicles.playerCar ? vehicles.playerCar : player.pos;
    rig.pose(mode, focus, vehicles.playerCar);
  },
  press(code, down) { input.press(code, down); },
  // Test hooks: freeze the rAF loop for deterministic step() sequences, and
  // reset the dynamic world (traffic / peds / cars / clock) to a fresh state.
  setAutoLoop(on) {
    on = !!on;
    if (on && !autoLoop) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
    autoLoop = on;
  },
  reset() {
    if (state.mode === 'driving') exitVehicle();
    for (let i = vehicles.list.length - 1; i >= 0; i--) vehicles.despawn(vehicles.list[i]);
    traffic.reset();
    peds.reset();
    spawnStarterCars();
    player.teleport(CONFIG.player.spawn.x, CONFIG.player.spawn.z, city.groundHeightAt);
    player.yaw = Math.PI;
    player.knockX = player.knockZ = 0;
    player.group.visible = true;
    state.time = 0;
    state.mode = 'onfoot';
    state.vehicle = null;
    state.health = 100; state.armor = 0; state.cash = 0; state.wanted = 0;
    state.mission = -1; state.objective = '';
    wanted.reset();
    police.reset();
    combat.reset();
    effects.reset();
    state.player.x = player.pos.x; state.player.z = player.pos.z;
    prevE = false;
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Space', 'ShiftLeft']) input.press(code, false);
    rig.initialized = false;
  },
  startGame,
  state,
  city,
  player,
  vehicles,
  traffic,
  peds,
  police,
  combat,
  wanted,
  effects,
  renderer,
  scene,
  camera,
};

updateHud();
render();
