// Neon Bay — minimap: north-up 2D canvas, cached road grid, player arrow, police, mission markers.
export function createMinimap(city, state, deps) {
  const cv = document.getElementById('minimap');
  const g = cv.getContext('2d');
  const S = 164, OX = 155, OZ = 155; // 1 px per meter, world offset
  const off = document.createElement('canvas');
  off.width = 402; off.height = 312;
  const og = off.getContext('2d');
  og.fillStyle = '#171029'; og.fillRect(0, 0, 402, 312);
  og.fillStyle = '#8a744f'; og.fillRect(126 + OX, 0, 64, 312);       // beach
  og.fillStyle = '#1d5f70'; og.fillRect(190 + OX, 0, 62, 312);       // ocean
  og.fillStyle = 'rgba(255,244,228,.07)';
  for (const cx of city.cellCenters) for (const cz of city.cellCenters) og.fillRect(cx - 14 + OX, cz - 14 + OZ, 28, 28);
  og.fillStyle = '#4a4556';
  for (const l of city.roads.lines) {
    og.fillRect(l - 6 + OX, -132 + OZ, 12, 264);
    og.fillRect(-132 + OX, l - 6 + OZ, 264, 12);
  }
  og.fillStyle = '#7a5c3e'; og.fillRect(150 + OX, -4 + OZ, 92, 8);   // pier
  function dot(x, z, sx, sy, color, r) {
    const a = x + OX - sx, b = z + OZ - sy;
    if (a < -4 || a > S + 4 || b < -4 || b > S + 4) return;
    g.fillStyle = color;
    g.beginPath(); g.arc(a, b, r, 0, 6.284); g.fill();
  }
  function draw() {
    const sx = state.player.x + OX - S / 2, sy = state.player.z + OZ - S / 2;
    g.fillStyle = '#171029'; g.fillRect(0, 0, S, S);
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy);
    const x1 = Math.min(off.width, sx + S), y1 = Math.min(off.height, sy + S);
    if (x1 > x0 && y1 > y0) g.drawImage(off, x0, y0, x1 - x0, y1 - y0, x0 - sx, y0 - sy, x1 - x0, y1 - y0);
    for (const v of deps.traffic.cars()) dot(v.x, v.z, sx, sy, 'rgba(255,244,228,.4)', 1.3);
    for (const v of deps.police.cars) dot(v.x, v.z, sx, sy, '#ff4a5e', 2.6);
    for (const c of deps.police.foot) dot(c.x, c.z, sx, sy, '#6bd5ff', 2);
    const gv = deps.missions.giverPos();
    if (gv) dot(gv.x, gv.z, sx, sy, '#35e0d2', 3);
    const mk = deps.missions.markerPos();
    if (mk) {
      const a = mk.x + OX - sx, b = mk.z + OZ - sy;
      if (a > -6 && a < S + 6 && b > -6 && b < S + 6) {
        g.fillStyle = '#ffc36b';
        g.beginPath(); g.moveTo(a, b - 5); g.lineTo(a + 4, b); g.lineTo(a, b + 5); g.lineTo(a - 4, b); g.fill();
      }
    }
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(Math.PI - state.player.yaw);
    g.fillStyle = '#fff4e4'; g.strokeStyle = '#ff5f9e'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(-4.5, 5); g.lineTo(4.5, 5); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  return { draw };
}