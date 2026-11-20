// Neon Bay — mission engine: story jobs, giver beacons, objective markers, completion checks, rewards.
import * as THREE from 'three';
import { STORY, STORY_END } from './story.js';
import { resolveCircleVsBoxes, segmentBlocked } from './util.js';
export function createMissions(deps) {
  const { scene, city, state, player, vehicles, peds, combat, wanted, effects, audio, hud, save, canvas } = deps;
  const tall = city.colliders.filter((b) => b.height > 3);
  let active = null, giverPed = null, pendingRestart = -1;
  // Beacon: translucent column + bobbing gem (2 draw calls each).
  function makeBeacon(color) {
    const g = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 7, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })
    );
    col.position.y = 3.5;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshBasicMaterial({ color }));
    gem.position.y = 7.12; // seated on the column tip, not hovering above it
    g.add(col, gem);
    g.visible = false;
    g.userData.gem = gem;
    scene.add(g);
    return g;
  }
  const beacon = makeBeacon(0xffc36b);
  const giverBeacon = makeBeacon(0x35e0d2);
  function setBeacon(x, z) {
    beacon.position.set(x, city.groundHeightAt(x, z), z);
    beacon.visible = true;
  }
  function spinBeacons(t) {
    for (const b of [beacon, giverBeacon]) if (b.visible) {
      b.userData.gem.rotation.y = t * 2;
      b.userData.gem.position.y = 7.12 + Math.sin(t * 3) * 0.12;
    }
  }
  function removeGiver() {
    if (giverPed && giverPed.active) peds.remove(giverPed);
    giverPed = null;
    giverBeacon.visible = false;
  }
  function spawnGiver() {
    removeGiver();
    if (state.progress >= STORY.length || state.mission >= 0) return;
    const g = STORY[state.progress].giver;
    giverPed = peds.spawnAt(g.x, g.z, { shirt: 0xffc36b, pants: 0x2f4858, hold: true, yaw: Math.PI });
    giverBeacon.position.set(g.x, city.groundHeightAt(g.x, g.z), g.z);
    giverBeacon.visible = true;
  }
  function cleanup() {
    if (active) {
      if (active.car && active.car.active) vehicles.despawn(active.car);
      for (const e of active.enemies) if (e.active) peds.remove(e);
    }
    active = null;
    beacon.visible = false;
  }
  const focusPos = () => (state.mode === 'driving' && vehicles.playerCar ? vehicles.playerCar : player.pos);
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  function start(i) {
    if (i < 0 || i >= STORY.length) return false;
    cleanup();
    const m = STORY[i];
    active = { m, i, phase: 0, t: m.time || 0, catch: 0, cp: 0, car: null, enemies: [] };
    state.mission = i;
    state.objective = m.objective;
    if (m.type === 'steal') {
      active.car = vehicles.spawn({ type: m.car.type, color: m.car.color, x: m.car.x, z: m.car.z, yaw: 0, kind: 'parked' });
      if (active.car) { active.car.missionCar = true; setBeacon(m.car.x, m.car.z); }
    } else if (m.type === 'chase') {
      const v = vehicles.spawn({ type: 'van', color: 0x8f7bff, x: m.van.x, z: m.van.z, yaw: Math.PI / 2, kind: 'traffic' });
      if (v) {
        v.ai = { dir: 2, road: m.van.road, cruise: 17, turn: null, wp: null }; // traffic AI drives it, fast
        v.missionCar = true; v.hp = 70;
        active.car = v;
        setBeacon(v.x, v.z);
      }
    } else if (m.type === 'escape') wanted.set(m.stars);
    else if (m.type === 'race') setBeacon(m.cps[0][0], m.cps[0][1]);
    else if (m.type === 'shootout') {
      for (const [x, z] of m.spots) {
        const e = peds.spawnAt(x, z, { shirt: 0x9a6bff, pants: 0x232c4d, hold: true });
        if (e) { e.hp = 45; e.shoot = 0.8 + Math.random(); active.enemies.push(e); }
      }
      setBeacon(m.spots[1][0], m.spots[1][1]);
    } else if (m.type === 'talk') setBeacon(m.giver.x, m.giver.z);
    else if (m.target) setBeacon(m.target.x, m.target.z);
    hud.toast('Mission started: ' + m.name);
    audio.pickup();
    return true;
  }
  function complete() {
    const m = active.m;
    state.cash += m.reward;
    state.progress = active.i + 1;
    state.mission = -1;
    cleanup();
    state.objective = state.progress >= STORY.length ? STORY_END : '';
    hud.toast(m.name + ' complete  +$' + m.reward);
    audio.reward();
    spawnGiver();
    save.save();
  }
  function fail(msg) {
    const i = active.i;
    hud.toast(msg);
    audio.down();
    cleanup();
    if (state.down) { pendingRestart = i; state.mission = i; state.objective = 'Mission failed — retrying when you respawn…'; }
    else start(i);
  }
  function openDialog(i) {
    const m = STORY[i];
    if (!m) return;
    state.dialog = { i, name: m.giver.name, lines: m.dialog, line: 0 };
    state.paused = true; // freeze the world while reading
    if (document.exitPointerLock) document.exitPointerLock();
  }
  function closeDialog() {
    state.dialog = null;
    state.paused = false;
    if (canvas.requestPointerLock) { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); }
  }
  function advanceDialog() {
    const d = state.dialog;
    if (!d) return;
    if (++d.line < d.lines.length) return;
    const i = d.i;
    closeDialog();
    if (state.mission < 0) start(i);
    if (STORY[i].type === 'talk' && active && active.i === i) complete();
  }
  // E edge (from main): dialogs first, then givers, then vehicles.
  function interact() {
    if (state.dialog) { advanceDialog(); return true; }
    if (!state.started || state.down || state.paused) return false;
    if (state.mission < 0 && giverPed && dist(player.pos, giverPed.x, giverPed.z) < 3.4) {
      openDialog(state.progress);
      return true;
    }
    if (active && active.m.type === 'talk' && giverPed && dist(player.pos, giverPed.x, giverPed.z) < 3.4) {
      openDialog(active.i);
      return true;
    }
    return false;
  }
  function updateEnemies(dt) {
    const px = player.pos.x, pz = player.pos.z;
    for (const e of active.enemies) {
      if (!e.active) continue;
      const dx = px - e.x, dz = pz - e.z;
      const d = Math.hypot(dx, dz) || 1;
      e.yaw = Math.atan2(dx, dz);
      if (state.mode === 'onfoot' && d > 9) {
        const pos = { x: e.x + (dx / d) * 2.8 * dt, z: e.z + (dz / d) * 2.8 * dt };
        resolveCircleVsBoxes(pos, 0.32, city.colliders);
        city.clampToWorld(pos);
        e.x = pos.x; e.z = pos.z;
        e.phase += dt * 8;
      }
      e.y = city.groundHeightAt(e.x, e.z);
      e.shoot -= dt;
      if (e.shoot <= 0 && d < 27 && !state.down && !segmentBlocked(e.x, e.z, px, pz, tall)) {
        e.shoot = 1.5;
        effects.tracer(e.x, e.y + 1.3, e.z, px, player.pos.y + 1.1, pz);
        effects.flash(e.x + (dx / d) * 0.6, e.y + 1.3, e.z + (dz / d) * 0.6);
        combat.damagePlayer(5, 'gang');
        audio.shot();
      }
    }
  }
  function update(dt, ctx) {
    spinBeacons(ctx.time);
    if (pendingRestart >= 0) {
      if (!state.down) { const i = pendingRestart; pendingRestart = -1; start(i); }
      return;
    }
    if (!active) return;
    const m = active.m, f = focusPos();
    if (m.type === 'goto') {
      if (dist(f, m.target.x, m.target.z) < m.target.r) complete();
    } else if (m.type === 'steal') {
      const car = active.car;
      if (!car || !car.active) return fail('The Comet was wrecked — the Crew will ready another.');
      if (active.phase === 0) {
        if (vehicles.playerCar === car) {
          active.phase = 1;
          state.objective = 'Deliver the Comet to the Harbor Court lot';
          setBeacon(m.drop.x, m.drop.z);
          hud.toast('Nice ride. Now bring it home.');
        }
      } else if (vehicles.playerCar === car && dist(car, m.drop.x, m.drop.z) < m.drop.r) complete();
    } else if (m.type === 'chase') {
      const van = active.car;
      if (!van || !van.active) return complete(); // wrecked counts
      setBeacon(van.x, van.z);
      const d = dist(f, van.x, van.z);
      active.catch = d < 8 ? active.catch + dt : Math.max(0, active.catch - dt * 2);
      state.objective = d < 8 ? 'Hold him boxed in! ' + Math.max(0, 2 - active.catch).toFixed(1) + 's' : m.objective;
      if (active.catch >= 2) complete();
    } else if (m.type === 'escape') {
      if (state.down) return fail('Busted — the heat resets, run it again.');
      if (state.wanted === 0) complete();
    } else if (m.type === 'race') {
      active.t -= dt;
      if (active.t <= 0) return fail('Out of time — the Kings are laughing. Run it again.');
      const [cx, cz] = m.cps[active.cp];
      state.objective = 'Checkpoint ' + (active.cp + 1) + '/' + m.cps.length + ' · ' + Math.ceil(active.t) + 's — drive!';
      if (state.mode === 'driving' && dist(f, cx, cz) < 9) {
        active.cp++;
        audio.pickup();
        if (active.cp >= m.cps.length) complete();
        else setBeacon(m.cps[active.cp][0], m.cps[active.cp][1]);
      }
    } else if (m.type === 'shootout') {
      if (state.down) return fail('Riko went down — the Kings regroup on the pier.');
      updateEnemies(dt);
      const left = active.enemies.filter((e) => e.active).length;
      state.objective = 'Saltline Kings left on the pier: ' + left;
      if (left === 0) complete();
    }
  }
  const sys = {
    update, start, interact, openDialog, closeDialog, advanceDialog,
    showDialog: (i) => openDialog(i),
    sync: spawnGiver,
    restart() { if (active) start(active.i); },
    nearGiver() {
      return state.mission < 0 && giverPed && state.started && !state.down &&
        dist(player.pos, giverPed.x, giverPed.z) < 3.4 ? STORY[state.progress].giver.name : null;
    },
    markerPos() { return beacon.visible ? { x: beacon.position.x, z: beacon.position.z } : null; },
    giverPos() { return giverBeacon.visible ? { x: giverBeacon.position.x, z: giverBeacon.position.z } : null; },
    list() {
      return STORY.map((m, i) => ({
        name: m.name, giver: m.giver.name, reward: m.reward, objective: m.objective,
        status: i < state.progress ? 'done' : i === state.mission ? 'active' : i === state.progress ? 'next' : 'locked',
      }));
    },
    reset() {
      cleanup();
      removeGiver();
      pendingRestart = -1;
      state.progress = 0; state.mission = -1; state.dialog = null; state.objective = '';
      spawnGiver();
    },
  };
  spawnGiver();
  return sys;
}