// Neon Bay — small math / random helpers shared by every module.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Frame-rate independent exponential smoothing.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// Deterministic PRNG so the city layout is identical on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randRange = (rng, lo, hi) => lo + rng() * (hi - lo);
export const randInt = (rng, lo, hi) => Math.floor(randRange(rng, lo, hi + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

// Shortest-path angle interpolation (radians).
export function dampAngle(a, b, lambda, dt) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * (1 - Math.exp(-lambda * dt));
}

// Axis-aligned box collider: { minX, maxX, minZ, maxZ, height }.
export function makeBox(cx, cz, w, d, height) {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height };
}

// Push a circle (x, z, radius) out of every box it overlaps. Mutates pos {x, z}.
// Returns true if any correction happened.
export function resolveCircleVsBoxes(pos, radius, boxes) {
  let hit = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (pos.x < b.minX - radius || pos.x > b.maxX + radius ||
        pos.z < b.minZ - radius || pos.z > b.maxZ + radius) continue;
    const nearX = clamp(pos.x, b.minX, b.maxX);
    const nearZ = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = nearX + (dx / d) * radius;
      pos.z = nearZ + (dz / d) * radius;
    } else {
      // Center inside the box: eject along the shallowest axis.
      const left = pos.x - b.minX, right = b.maxX - pos.x;
      const front = pos.z - b.minZ, back = b.maxZ - pos.z;
      const m = Math.min(left, right, front, back);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === front) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return hit;
}

export function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

// 2D segment vs AABB slab test — true if any tall box blocks the line.
export function segmentBlocked(x1, z1, x2, z2, boxes) {
  const dx = x2 - x1, dz = z2 - z1;
  for (const b of boxes) {
    if (b.height < 2) continue;
    let tmin = 0, tmax = 1;
    let ok = true;
    for (const [o, d, lo, hi] of [[x1, dx, b.minX, b.maxX], [z1, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { ok = false; break; }
      } else {
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok) return true;
  }
  return false;
}
