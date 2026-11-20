// Neon Bay — keyboard/mouse capture. Pointer lock drives the look controls;
// press() lets the deterministic __NB test hook inject key states.

export function createInput(canvas) {
  const keys = Object.create(null);
  const mouse = { dx: 0, dy: 0, locked: false };

  // Keys whose browser default (scroll, focus change) would fight the game.
  const SWALLOW = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (SWALLOW.has(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  // Dropping focus must not leave a key stuck down.
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  canvas.addEventListener('click', () => {
    if (!mouse.locked && canvas.requestPointerLock) {
      const p = canvas.requestPointerLock();
      // Headless or permission-denied: play on without lock instead of throwing.
      if (p && p.catch) p.catch(() => {});
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
    // Drain accumulated look deltas; called once per simulation step.
    consumeMouse() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0; mouse.dy = 0;
      return d;
    },
  };
}
