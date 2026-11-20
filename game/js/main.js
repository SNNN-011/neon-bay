// Neon Bay — boot + main loop. Wires renderer, golden-hour sky/lighting,
// city, player and camera together, and exposes the deterministic __NB hook
// (step/render without requestAnimationFrame) used for testing and capture.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp } from './util.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera.js';
import { buildCity } from './city.js';
import { createPlayer } from './player.js';

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
  player: { x: player.pos.x, y: 0, z: player.pos.z, yaw: player.yaw, grounded: true, speed: 0 },
};

// ---- HUD skeleton updates (later phases own the real HUD) -------------------
const hud = {
  health: document.getElementById('health-fill'),
  armor: document.getElementById('armor-fill'),
  cash: document.getElementById('cash'),
  stars: Array.from(document.querySelectorAll('#wanted .star')),
  objective: document.getElementById('objective'),
  start: document.getElementById('start-screen'),
  pause: document.getElementById('pause-screen'),
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
}

// ---- simulation step (shared by the rAF loop and the __NB hook) -------------
function step(dt) {
  dt = clamp(dt, 0, 0.05);
  state.time += dt;
  if (!state.paused) {
    player.update(dt, {
      input,
      cameraYaw: rig.yaw,
      colliders: city.colliders,
      groundHeightAt: city.groundHeightAt,
      clampToWorld: city.clampToWorld,
      state,
    });
    rig.update(dt, player.pos, city.colliders);
  }
  // Keep the shadow frustum and sky centered on the player.
  sun.position.copy(player.pos).add(sunOffset);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();
  sky.position.set(camera.position.x, 0, camera.position.z);
  updateHud();
}

function render() {
  renderer.render(scene, camera);
}

// ---- normal play loop --------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  step(dt);
  render();
  requestAnimationFrame(frame);
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
    player.teleport(x, z, city.groundHeightAt);
    state.player.x = x; state.player.z = z;
    rig.initialized = false;
  },
  setWanted(n) {
    state.wanted = clamp(Math.round(n), 0, 5); // P3 wires real police logic
    updateHud();
  },
  startMission(i) {
    state.mission = i;                          // P4 wires real mission logic
    state.objective = 'Mission ' + i + ' (stub — story arrives in P4)';
    updateHud();
  },
  poseCamera(mode) {
    rig.pose(mode, player.pos);
  },
  press(code, down) { input.press(code, down); },
  startGame,
  state,
  city,
  player,
  renderer,
  scene,
  camera,
};

updateHud();
render();
