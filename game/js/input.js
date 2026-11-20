// Neon Bay — keyboard + mouse state; pointer lock drives look, press() feeds the deterministic test hook.

export function createInput(canvas) {
  const keys = Object.create(null);
  const mouse = { dx: 0, dy: 0, locked: false };

  const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (PREVENT.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('click', () => {
    if (!mouse.locked && canvas.requestPointerLock) {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {}); // headless / denied: keep playing without lock
    }
  });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (mouse.locked) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
    }
  });

  return {
    keys,
    mouse,
    isDown: (code) => !!keys[code],
    press(code, down) { keys[code] = !!down; },
    // Read accumulated mouse deltas once per simulation step.
    consumeMouse() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0; mouse.dy = 0;
      return d;
    },
  };
}
