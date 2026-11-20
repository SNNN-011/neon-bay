// Neon Bay — centralized HUD: vitals, cash, stars, objective, weapon, speedo, mission log, dialog, toasts.
import { clamp } from './util.js';
export function createHud(state, deps) {
  const { vehicles, player, input } = deps;
  let missions = null;
  const el = {
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
  const toastEl = document.createElement('div');
  toastEl.id = 'toast';
  document.body.appendChild(toastEl);
  const dialogEl = document.createElement('div');
  dialogEl.id = 'dialog';
  dialogEl.className = 'panel';
  dialogEl.innerHTML = '<div id="dlg-name"></div><div id="dlg-text"></div><div class="dlg-btns"><button id="dlg-close">Close</button><button id="dlg-next">Next</button></div>';
  document.body.appendChild(dialogEl);
  const dlgName = dialogEl.querySelector('#dlg-name');
  const dlgText = dialogEl.querySelector('#dlg-text');
  const dlgNext = dialogEl.querySelector('#dlg-next');
  dialogEl.querySelector('#dlg-close').addEventListener('click', () => missions && missions.closeDialog());
  dlgNext.addEventListener('click', () => missions && missions.advanceDialog());
  const logEl = document.createElement('div');
  logEl.id = 'mission-log';
  logEl.className = 'panel';
  document.body.appendChild(logEl);
  let logOpen = false, toastT = 0, prevTab = false, lastKey = '', lastLog = '';
  const STATUS = { done: ['DONE', '#3dff8f'], active: ['ACTIVE', '#ffc36b'], next: ['NEXT', '#35e0d2'], locked: ['LOCKED', 'rgba(255,244,228,.4)'] };
  function renderLog() {
    const rows = missions.list().map((m) => {
      const [label, color] = STATUS[m.status];
      return '<div class="mrow"><div class="top"><b>' + m.name + '</b><span class="st" style="color:' + color + '">' + label + ' · $' + m.reward + '</span></div><div class="sub">' + m.giver + ' — ' + m.objective + '</div></div>';
    }).join('');
    if (rows === lastLog) return;
    lastLog = rows;
    logEl.innerHTML = '<h3>TIDEWATER CREW — MISSION LOG</h3>' + rows + '<div class="sub" style="margin-top:10px">Tab closes · talk to the marked giver to start the next job</div>';
  }
  function update(dt) {
    el.health.style.width = clamp(state.health, 0, 100) + '%';
    el.armor.style.width = clamp(state.armor, 0, 100) + '%';
    el.cash.textContent = '$' + state.cash.toLocaleString('en-US');
    el.stars.forEach((s, i) => s.classList.toggle('lit', i < state.wanted));
    el.objective.textContent = state.objective;
    el.objective.style.display = state.objective ? 'block' : 'none';
    const driving = state.mode === 'driving' && state.vehicle;
    el.speedo.style.display = driving ? 'block' : 'none';
    const armed = state.started && !driving && !state.down && !state.dialog;
    el.weapon.style.display = armed ? 'block' : 'none';
    if (armed) el.weapon.textContent = state.ammo > 0 ? 'PISTOL · ' + state.ammo : 'FISTS · find ammo';
    el.crosshair.style.display = armed && !state.paused ? 'block' : 'none';
    if (driving) {
      el.speedo.innerHTML = Math.round(Math.abs(state.vehicle.speed) * 3.6) + ' <small>km/h</small>';
      el.hint.textContent = 'W/S gas & brake · A/D steer · Space handbrake · E exit';
    } else {
      const giver = missions && missions.nearGiver();
      const near = giver ? null : vehicles.nearestEnterable(player.pos.x, player.pos.z, 3.6);
      el.hint.textContent = state.dialog ? 'E or Next to continue · Close to walk away'
        : giver ? 'Press E to talk to ' + giver
        : near ? 'Press E to enter the ' + near.type + (near.kind === 'traffic' ? ' (steal)' : '')
        : 'WASD move · Shift sprint · Space jump · Tab mission log · M mute';
    }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.display = 'none'; }
    const d = state.dialog;
    dialogEl.style.display = d ? 'block' : 'none';
    if (d) {
      const key = d.i + ':' + d.line;
      if (key !== lastKey) {
        lastKey = key;
        dlgName.textContent = d.name;
        dlgText.textContent = d.lines[d.line];
        dlgNext.textContent = d.line >= d.lines.length - 1 ? 'Accept' : 'Next';
      }
    } else lastKey = '';
    const tab = input.isDown('Tab');
    if (tab && !prevTab && state.started && !state.dialog) logOpen = !logOpen;
    prevTab = tab;
    if (state.paused && !state.dialog) logOpen = false;
    logEl.style.display = logOpen ? 'block' : 'none';
    if (logOpen && missions) renderLog();
  }
  return {
    update, el, start: el.start, pause: el.pause,
    attach(m) { missions = m; },
    toast(msg) { toastEl.textContent = msg; toastEl.style.display = 'block'; toastT = 3.4; },
  };
}