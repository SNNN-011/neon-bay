// Neon Bay — wanted system: crimes add heat, heat maps to 1-5 stars.
// Escape = no police line-of-sight for a cooldown, then stars drop one by one.

import { CONFIG } from './config.js';
import { clamp } from './util.js';

const W = CONFIG.wanted;

export function createWanted(state) {
  const sys = { heat: 0, escape: 0, hot: 0, crimePos: { x: state.player.x, z: state.player.z } };

  function level() {
    let n = 0;
    for (const t of W.thresholds) if (sys.heat >= t) n++;
    return n;
  }

  // A crime: heat up, refresh the reinforcement window, reset escape progress.
  // Dispatch goes to where the crime happened, not where the player runs to.
  sys.crime = (points) => {
    sys.heat = clamp(sys.heat + points, 0, 100);
    sys.escape = 0;
    sys.hot = W.hotWindow;
    sys.crimePos.x = state.player.x;
    sys.crimePos.z = state.player.z;
    state.wanted = level();
  };

  // Direct set (test hook / mission scripts): spawns police via the hot window.
  sys.set = (n) => {
    n = clamp(Math.round(n), 0, 5);
    sys.heat = n === 0 ? 0 : W.thresholds[n - 1] + 2;
    sys.escape = 0;
    sys.hot = n > 0 ? W.hotWindow : 0;
    sys.crimePos.x = state.player.x;
    sys.crimePos.z = state.player.z;
    state.wanted = n;
  };

  sys.update = (dt, ctx) => {
    sys.hot = Math.max(0, sys.hot - dt);
    if (state.wanted <= 0 || state.down) { sys.escape = 0; return; }
    if (ctx.police.seesPlayer) sys.escape = 0;
    else sys.escape += dt;
    if (sys.escape >= W.escapeTime + state.wanted) {
      // Cool one star without calling in reinforcements.
      const next = state.wanted - 1;
      sys.heat = next === 0 ? 0 : W.thresholds[next - 1] + 2;
      sys.escape = 0;
      state.wanted = next;
    }
  };

  sys.reset = () => { sys.heat = 0; sys.escape = 0; sys.hot = 0; state.wanted = 0; };
  return sys;
}