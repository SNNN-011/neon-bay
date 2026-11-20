// Neon Bay — localStorage save: position, cash, vitals, ammo, wanted, story progress; auto-save + Continue.
const KEY = '***';
export function createSave(state, deps) {
  const { player, city, wanted } = deps;
  let timer = 0;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        x: player.pos.x, z: player.pos.z, yaw: player.yaw,
        cash: state.cash, health: state.health, armor: state.armor, ammo: state.ammo,
        wanted: state.wanted, progress: state.progress, mission: state.mission, time: state.time,
      }));
    } catch (e) { /* private mode etc. — play without persistence */ }
  }
  function has() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  // Returns the parsed save (main resumes the mission / giver), or null.
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; }
    if (!d || typeof d.x !== 'number') return null;
    player.teleport(d.x, d.z, city.groundHeightAt);
    player.yaw = d.yaw || Math.PI;
    player.knockX = player.knockZ = 0;
    state.cash = d.cash | 0;
    state.health = Math.min(100, Math.max(25, d.health | 0));
    state.armor = d.armor | 0;
    state.ammo = d.ammo | 0;
    state.progress = d.progress | 0;
    state.time = d.time || 0;
    wanted.set(d.wanted | 0);
    return d;
  }
  function update(dt) {
    if (!state.started || state.paused || state.down) return;
    timer += dt;
    if (timer >= 20) { timer = 0; save(); }
  }
  return { save, has, clear, load, update };
}