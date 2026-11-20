// Neon Bay — shared math kit: interpolation, seeded randomness and the 2D
// collision primitives every movement system builds on.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Exponential smoothing that behaves the same at any frame rate.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

// mulberry32: tiny deterministic PRNG. Fixed seeds keep the city layout,
// traffic patterns and prop colors identical across loads.
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

// Angle easing that always takes the short way around the circle.
export function dampAngle(a, b, lambda, dt) {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * (1 - Math.exp(-lambda * dt));
}

// Static AABB collider record: { minX, maxX, minZ, maxZ, height }.
export function makeBox(cx, cz, w, d, height) {
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, height };
}

// Push a circle out of every box it overlaps; true when anything moved.
export function resolveCircleVsBoxes(pos, radius, boxes) {
  let touched = false;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    // Cheap reject before the precise nearest-point test.
    if (pos.x < b.minX - radius || pos.x > b.maxX + radius ||
        pos.z < b.minZ - radius || pos.z > b.maxZ + radius) continue;
    const nearX = clamp(pos.x, b.minX, b.maxX);
    const nearZ = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    touched = true;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      pos.x = nearX + (dx / d) * radius;
      pos.z = nearZ + (dz / d) * radius;
    } else {
      // Dead center inside the box: escape through the nearest face.
      const left = pos.x - b.minX, right = b.maxX - pos.x;
      const front = pos.z - b.minZ, back = b.maxZ - pos.z;
      const shallow = Math.min(left, right, front, back);
      if (shallow === left) pos.x = b.minX - radius;
      else if (shallow === right) pos.x = b.maxX + radius;
      else if (shallow === front) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  return touched;
}

export function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

// Line-of-sight helper: slab-test a 2D segment against tall boxes only.
export function segmentBlocked(x1, z1, x2, z2, boxes) {
  const dx = x2 - x1, dz = z2 - z1;
  for (const b of boxes) {
    if (b.height < 2) continue; // low props never block sight
    let tmin = 0, tmax = 1;
    let hit = true;
    for (const [o, d, lo, hi] of [[x1, dx, b.minX, b.maxX], [z1, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { hit = false; break; }
      } else {
        let t1 = (lo - o) / d, t2 = (hi - o) / d;
        if (t1 > t2) { const swap = t1; t1 = t2; t2 = swap; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}
