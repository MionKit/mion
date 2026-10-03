// Generates terrain/grass-island.svg: node generators/grass-island.mjs terrain/grass-island.svg
import {writeFileSync} from 'node:fs';

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const r = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const f = (n) => n.toFixed(1);
const deg = (d) => (d * Math.PI) / 180;

const ROUND = 0.16; // corner radius, as a fraction of the tile side
const D = 50; // cliff height
const BG = '#1a2439'; // background colour the cliff bottom fades into
const SHADOW_DROP = 14; // how far below the cliff bottom the floating island's shadow falls
const SHADOW_SPREAD = 1.12; // and how much wider than the island it spreads
const GRASS = ['#6d9638', '#7fa843', '#5e8a32', '#93b852'];

// the tile is a unit square (a, b) seen isometrically: a runs top→right corner, b runs top→left corner
const iso = (a, b) => [300 + 260 * a - 260 * b, 40 + 130 * a + 130 * b];
const CORNERS = {right: [1 - ROUND, ROUND], bottom: [1 - ROUND, 1 - ROUND], left: [ROUND, 1 - ROUND], top: [ROUND, ROUND]};
const arc = ([ca, cb], from, to, n) => Array.from({length: n + 1}, (_, i) => {
  const t = deg(from + ((to - from) * i) / n);
  return iso(ca + ROUND * Math.cos(t), cb + ROUND * Math.sin(t));
});
const line = (p, q, n) => Array.from({length: n - 1}, (_, i) => [p[0] + ((q[0] - p[0]) * (i + 1)) / n, p[1] + ((q[1] - p[1]) * (i + 1)) / n]);

// visible front edge, from the rightmost point round the bottom corner to the leftmost point
const rightArc = arc(CORNERS.right, -45, 0, 6);
const bottomArc = arc(CORNERS.bottom, 0, 90, 12);
const leftArc = arc(CORNERS.left, 90, 135, 6);
const frontEven = [...rightArc, ...line(rightArc.at(-1), bottomArc[0], 34), ...bottomArc, ...line(bottomArc.at(-1), leftArc[0], 34), ...leftArc];
// the back edge closes the outline of the top
const backRight = arc(CORNERS.left, 135, 180, 6);
const topArc = arc(CORNERS.top, 180, 270, 12);
const rightTop = arc(CORNERS.right, -90, -45, 6);
const back = [...backRight, ...line(backRight.at(-1), topArc[0], 34), ...topArc, ...line(topArc.at(-1), rightTop[0], 34), ...rightTop];
// wobble the whole edge with looping waves so the grass meets the soil in an uneven line
const waves = [[5, 3, r(0, 7)], [11, 2, r(0, 7)], [23, 1.2, r(0, 7)]];
const outline = [...frontEven, ...back].map(([x, y], i, all) => {
  const t = (i / all.length) * Math.PI * 2;
  return [x, y + waves.reduce((sum, [freq, amp, phase]) => sum + amp * Math.sin(freq * t + phase), 0)];
});
const front = outline.slice(0, frontEven.length);
const pathOf = (pts, close) => 'M' + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L') + (close ? ' Z' : '');

// smooth closed blob through jittered points around an ellipse (the side stones)
function blob(cx, cy, rx, ry, jitter = 0.18, n = 7) {
  const pts = [];
  const start = r(0, Math.PI);
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const k = 1 + r(-jitter, jitter);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${mid(pts[0], pts[1]).map(f).join(' ')}`;
  for (let i = 1; i <= n; i++) {
    const p = pts[i % n], q = pts[(i + 1) % n];
    d += ` Q${f(p[0])} ${f(p[1])} ${mid(p, q).map(f).join(' ')}`;
  }
  return d + ' Z';
}

const clamp = (n) => Math.min(1, Math.max(0, n));
const toHsl = (hex) => {
  const [red, green, blue] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === red ? (green - blue) / d + (green < blue ? 6 : 0) : max === green ? (blue - red) / d + 2 : (red - green) / d + 4;
  return [h / 6, s, l];
};
const toHex = ([h, s, l]) => {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const channel = (t) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return '#' + [h + 1 / 3, h, h - 1 / 3].map((t) => Math.round(channel(t) * 255).toString(16).padStart(2, '0')).join('');
};
// a random nearby colour, so no two stones share one
const vary = (hex) => {
  const [h, s, l] = toHsl(hex);
  return toHex([h + r(-0.015, 0.015), clamp(s + r(-0.12, 0)), clamp(l + r(-0.06, 0.06))]);
};
const tone = (hex, dl) => {
  const [h, s, l] = toHsl(hex);
  return toHex([h, s, clamp(l + dl)]);
};

// stone outlines: each kind sets the height/width ratio, corner count, roughness, corner style and how far it may tilt
const KINDS = {
  round: {ratio: [0.8, 1], n: [7, 9], jitter: 0.1, sharp: false, tilt: 15},
  flat: {ratio: [0.4, 0.6], n: [7, 9], jitter: 0.15, sharp: false, tilt: 20},
  tall: {ratio: [1.1, 1.4], n: [7, 8], jitter: 0.14, sharp: false, tilt: 20},
  lumpy: {ratio: [0.65, 0.95], n: [8, 10], jitter: 0.18, sharp: false, tilt: 25},
  shard: {ratio: [0.6, 1.1], n: [5, 7], jitter: 0.2, sharp: true, tilt: 40},
  wedge: {ratio: [0.6, 0.9], n: [4, 5], jitter: 0.12, sharp: true, tilt: 45},
};
function stoneShape(size, kind = pick(Object.keys(KINDS))) {
  const spec = KINDS[kind];
  const rx = size, ry = size * r(...spec.ratio);
  const n = Math.floor(r(spec.n[0], spec.n[1] + 1));
  const tilt = deg(r(-spec.tilt, spec.tilt)), start = r(0, Math.PI * 2);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = start + ((i + r(-0.3, 0.3)) / n) * Math.PI * 2;
    const k = 1 + r(-spec.jitter, spec.jitter);
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    pts.push([x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  const w = Math.max(...pts.map((p) => Math.abs(p[0]))), h = Math.max(...pts.map((p) => Math.abs(p[1])));
  return {pts, sharp: spec.sharp, w, h};
}
// the outline placed at (cx, cy) and scaled; sharp kinds keep straight sides with small rounded corners
function stonePath({pts, sharp}, cx, cy, scale = 1, scaleY = scale) {
  const P = pts.map(([x, y]) => [cx + x * scale, cy + y * scaleY]);
  const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const cut = sharp ? 0.32 : 0.5;
  let d = `M${along(P[0], P[1], cut).map(f).join(' ')}`;
  for (let i = 1; i <= P.length; i++) {
    const p = P[i % P.length], prev = P[i - 1], next = P[(i + 1) % P.length];
    if (sharp) d += ` L${along(prev, p, 1 - cut).map(f).join(' ')}`;
    d += ` Q${f(p[0])} ${f(p[1])} ${along(p, next, cut).map(f).join(' ')}`;
  }
  return d + ' Z';
}
// shine on the upper edge: the highest side for sharp stones, a short arc for round ones
function shine({pts, sharp, w, h}, cx, cy, width, opacity) {
  if (sharp) {
    let best = 0;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length], b = pts[(best + 1) % pts.length];
      if (p[1] + q[1] < pts[best][1] + b[1]) best = i;
    });
    const [a, b] = [pts[best], pts[(best + 1) % pts.length]];
    return `<path d="M${f(cx + a[0] * 0.85)} ${f(cy + a[1] * 0.85)} L${f(cx + b[0] * 0.85)} ${f(cy + b[1] * 0.85)}" stroke="#fff" stroke-width="${f(width)}" stroke-linecap="round" opacity="${opacity}"/>`;
  }
  return `<path d="M${f(cx - w * 0.55)} ${f(cy - h * 0.3)} Q${f(cx - w * 0.1)} ${f(cy - h * 0.8)} ${f(cx + w * 0.4)} ${f(cy - h * 0.5)}" stroke="#fff" stroke-width="${f(width)}" stroke-linecap="round" fill="none" opacity="${opacity}"/>`;
}

// soil and stones for one side, drawn flat (u across, v down) and sheared into place by `matrix`
function soil(matrix) {
  const placed = [];
  let stones = '';
  for (let tries = 0; tries < 900 && placed.length < 46; tries++) {
    const rx = r(4, 13), ry = rx * r(0.55, 0.85);
    const cx = r(-30, 300), cy = r(-4, D + 4);
    if (placed.some((s) => Math.hypot(s.cx - cx, (s.cy - cy) * 1.4) < (s.rx + rx) * 0.95)) continue;
    placed.push({cx, cy, rx});
    const base = pick(['#8b7d8f', '#776a7d', '#9a8c84', '#6a5b6c', '#a3989f', '#857066']);
    stones += `<g>
      <path d="${blob(cx, cy, rx, ry)}" fill="${base}"/>
      <path d="${blob(cx + rx * 0.15, cy + ry * 0.25, rx * 0.85, ry * 0.7)}" fill="#000" opacity="0.18"/>
      <path d="M${f(cx - rx * 0.6)} ${f(cy - ry * 0.35)} Q${f(cx - rx * 0.1)} ${f(cy - ry * 0.85)} ${f(cx + rx * 0.45)} ${f(cy - ry * 0.5)}" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.35"/>
    </g>`;
  }
  let specks = '';
  for (let i = 0; i < 110; i++) specks += `<circle cx="${f(r(-30, 300))}" cy="${f(r(-4, D + 8))}" r="${f(r(0.6, 1.8))}" fill="${pick(['#2c1d29', '#7b5a63', '#a07a6e'])}" opacity="0.8"/>`;
  // soil and stones come back apart, so the roots can sit between them
  return {
    soil: `<g transform="matrix(${matrix})"><rect x="-40" y="-40" width="350" height="${D + 70}" fill="url(#gi-soil)"/>${specks}</g>`,
    stones: `<g transform="matrix(${matrix})">${stones}</g>`,
  };
}

// the sides: two sheared soil textures meeting at the bottom corner, cut to the rounded outline
function cliff() {
  const outerSeed = seed;
  seed = 4242; // own random stream, so changes to the top never reshuffle the sides
  const bottom = front.map(([x, y], i) => [x, y + D + (i === 0 || i === front.length - 1 ? 0 : r(-2, 9))]);
  const shape = pathOf([...front, ...[...bottom].reverse()], true);
  let roots = '';
  for (let i = 0; i < 30; i++) {
    const [x, y] = pick(front.slice(2, -2));
    const len = 12 + rnd() ** 1.5 * 32, sway = r(-6, 6);
    roots += `<path d="M${f(x)} ${f(y + 4)} Q${f(x + sway)} ${f(y + len * 0.6)} ${f(x + sway * 0.4)} ${f(y + len)}" stroke="#3a2a22" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.8"/>`;
  }
  const left = soil('1,0.5,0,1,40,170'), right = soil('1,-0.5,0,1,300,300');
  seed = outerSeed;
  return `<g id="cliff">
    <clipPath id="gi-cliff-clip"><path d="${shape}"/></clipPath>
    <clipPath id="gi-left-half"><rect x="0" y="0" width="300" height="400"/></clipPath>
    <clipPath id="gi-right-half"><rect x="300" y="0" width="300" height="400"/></clipPath>
    <g clip-path="url(#gi-cliff-clip)">
      <g clip-path="url(#gi-left-half)">${left.soil}</g>
      <g clip-path="url(#gi-right-half)">${right.soil}</g>
      <g id="roots">${roots}</g>
      <g clip-path="url(#gi-left-half)">${left.stones}</g>
      <g clip-path="url(#gi-right-half)">${right.stones}</g>
      <path d="${pathOf(front)}" stroke="#3b2a1f" stroke-width="8" fill="none" stroke-linejoin="round" opacity="0.8" filter="url(#gi-soft)"/>
      <rect x="0" y="0" width="600" height="400" fill="url(#gi-turn)"/>
      <path d="${pathOf(front)}" stroke="url(#gi-top)" stroke-width="16" fill="none" stroke-linejoin="round" filter="url(#gi-bleed)" transform="translate(0 -2)"/>
      <path d="${pathOf(bottom)}" stroke="#140c16" stroke-width="44" fill="none" stroke-linejoin="round" filter="url(#gi-blur-wide)" opacity="0.9" transform="translate(0 6)"/>
      <path d="${pathOf(bottom)}" stroke="${BG}" stroke-width="28" fill="none" stroke-linejoin="round" filter="url(#gi-blur)" transform="translate(0 6)"/>
    </g>
  </g>`;
}

// one clump in its own group, rooted at (x, y) so it can sway; every blade its own height (4 to 40 px, mostly short)
function grassCluster(x, y) {
  const blades = 5 + Math.floor(rnd() ** 2 * 10), vigor = r(0.4, 1);
  const spread = 2.5 + blades * 0.45 + r(0, 2);
  let out = `<g class="tuft" transform-origin="${f(x)} ${f(y)}"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(spread + 3)}" ry="${f((spread + 3) * 0.45)}" fill="#4c6b2a" opacity="0.35"/>`;
  for (let k = 0; k < blades; k++) {
    const bx = x + r(-spread, spread), h = 4 + rnd() ** 2.5 * 36 * vigor, lean = h * r(-0.35, 0.35), w = r(2.5, 4.5) * (1 + ((h - 4) / 36) * 0.5);
    const tipY = y - h;
    out += `<path d="M${f(bx)} ${f(y)} Q${f(bx + lean * 0.3)} ${f((y + tipY) / 2)} ${f(bx + lean)} ${f(tipY)}" stroke="${pick(GRASS)}" stroke-width="${f(w)}" stroke-linecap="round" fill="none"/>`;
  }
  return out + '</g>';
}


const insideOutline = ([x, y]) => {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// random point on the wavy top, at least `margin` (tile fraction) in from the edge;
// it must sit `lift` px or more above the front edge (an area nudged towards the back), `backBias` (0..1) favours the far corner, `maxDepth` (0..2) caps a + b
function randomInside(margin, {lift = 0, backBias = 0, maxDepth = 2} = {}) {
  for (;;) {
    const a = r(margin, 1 - margin), b = r(margin, 1 - margin);
    const ca = Math.min(Math.max(a, ROUND), 1 - ROUND), cb = Math.min(Math.max(b, ROUND), 1 - ROUND);
    if (Math.hypot(a - ca, b - cb) > Math.max(0, ROUND - margin)) continue;
    if (a + b > maxDepth || rnd() > 1 - backBias + backBias * (1 - (a + b) / 2) ** 2) continue;
    const [x, y] = iso(a, b);
    if (insideOutline([x, y]) && insideOutline([x, y + lift])) return [x, y];
  }
}

// raised stones on the top, mostly low and wide: ground shadow, darker body, lit cap, shine; each its own kind, height and colour
const PEBBLE_KINDS = {
  flat: {weight: 40, lift: [0.1, 0.2], cap: [0.88, 0.96], outline: ['flat', 'round', 'lumpy']},
  pebble: {weight: 30, lift: [0.2, 0.32], cap: [0.85, 0.95], outline: ['flat', 'round', 'lumpy']},
  chunky: {weight: 14, lift: [0.32, 0.45], cap: [0.8, 0.92], outline: ['round', 'lumpy', 'shard']},
  shard: {weight: 11, lift: [0.25, 0.45], cap: [0.8, 0.92], outline: ['shard', 'wedge']},
  tall: {weight: 5, lift: [0.5, 0.7], cap: [0.75, 0.9], outline: ['round', 'shard']},
};
const pickWeighted = (table) => {
  let roll = r(0, Object.values(table).reduce((sum, kind) => sum + kind.weight, 0));
  return Object.values(table).find((kind) => (roll -= kind.weight) <= 0);
};
const ISO_Y = 0.55;
const pebbleList = [];
for (let i = 0; i < 50; i++) {
  const [x, y] = randomInside(0.08);
  const spec = pickWeighted(PEBBLE_KINDS);
  const size = r(3, 9.5), shape = stoneShape(size, pick(spec.outline));
  const lift = size * r(...spec.lift), cap = r(...spec.cap);
  const lit = vary(pick(['#d9a08a', '#c98b7c', '#dcb79a', '#c49aa2', '#aaa0a6', '#bdb0a3']));
  const footH = shape.h * ISO_Y;
  const capShape = {...shape, pts: shape.pts.map(([px, py]) => [px * cap, py * cap * ISO_Y]), w: shape.w * cap, h: footH * cap};
  pebbleList.push({y, svg: `<g>
    <ellipse cx="${f(x + shape.w * 0.25)}" cy="${f(y + footH * 0.6)}" rx="${f(shape.w * 1.15)}" ry="${f(footH * 0.9)}" fill="#3b2a1f" opacity="0.35"/>
    <path d="${stonePath(shape, x, y - lift / 2, 1, ISO_Y + lift / (2 * shape.h))}" fill="${tone(lit, -0.2)}"/>
    <path d="${stonePath(shape, x - shape.w * 0.05, y - lift, cap, cap * ISO_Y)}" fill="${lit}"/>
    <path d="${stonePath(shape, x - shape.w * 0.2, y - lift - footH * 0.15, cap * 0.45, cap * 0.45 * ISO_Y)}" fill="#fff" opacity="${f(r(0.12, 0.28))}"/>
    ${shine(capShape, x - shape.w * 0.05, y - lift, Math.max(1, size * 0.2), f(r(0.3, 0.5)))}
  </g>`});
}
// draw back to front so taller stones overlap correctly
const pebbles = pebbleList.sort((a, b) => a.y - b.y).map((p) => p.svg).join('');
let grit = '';
for (let i = 0; i < 180; i++) {
  const [x, y] = randomInside(0.03);
  // transparency from a hash of the index, not rnd(), so adding it moved nothing else on the island
  const fade = 0.2 + 0.75 * ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1);
  grit += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r(0.6, 1.6))}" fill="${pick(['#6e5530', '#d9bf72', '#6f8a34', '#9a7a3d'])}" opacity="${f(fade)}"/>`;
}
// small grass tufts spread over the top, denser towards the green edge and the far corner
const tuftList = [];
for (let i = 0; i < 60; i++) {
  const [x, y] = randomInside(0.02, i < 36 ? {lift: 12, backBias: 0.85} : {lift: 12, maxDepth: 0.9});
  const svg = grassCluster(x, y);
  // every 4th clump is drawn but left out, so thinning the grass moves nothing else
  if (i % 4 !== 3) tuftList.push({y, svg});
}

// edge clump: longer blades that curve outwards past the outline; `side` is -1 (lean left), 1 (lean right) or 0 (either way)
function edgeCluster(x, y, side) {
  const blades = 5 + Math.floor(rnd() * 5), vigor = r(0.6, 1), spread = r(3, 6);
  let out = `<g class="tuft edge" transform-origin="${f(x)} ${f(y)}"><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(spread + 3)}" ry="${f((spread + 3) * 0.45)}" fill="#4c6b2a" opacity="0.35"/>`;
  for (let k = 0; k < blades; k++) {
    const bx = x + r(-spread, spread), len = 10 + rnd() ** 1.8 * 26 * vigor;
    const dir = side || (rnd() < 0.5 ? -1 : 1);
    // most blades bend hard outwards, a few stay nearly upright or lean back in
    const angle = deg(rnd() < 0.75 ? dir * r(25, 65) : -dir * r(0, 20));
    const tipX = bx + Math.sin(angle) * len, tipY = y - Math.cos(angle) * len;
    const midX = bx + Math.sin(angle * 0.35) * len * 0.55, midY = y - Math.cos(angle * 0.35) * len * 0.55;
    const w = r(3, 5) * (1 + ((len - 10) / 26) * 0.4);
    out += `<path d="M${f(bx)} ${f(y)} Q${f(midX)} ${f(midY)} ${f(tipX)} ${f(tipY)}" stroke="${pick(GRASS)}" stroke-width="${f(w)}" stroke-linecap="round" fill="none"/>`;
  }
  return out + '</g>';
}

// 4 edge clumps near each background corner and the front corner, rooted a few px inside the edge; 'split' leans each clump away from the corner
const EDGE_CORNERS = [
  {corner: CORNERS.left, angle: 135, side: -1},
  {corner: CORNERS.top, angle: 225, side: 0},
  {corner: CORNERS.right, angle: 315, side: 1},
  {corner: CORNERS.bottom, angle: 45, side: 'split'},
];
for (const {corner, angle, side} of EDGE_CORNERS) {
  const [cx, cy] = iso(corner[0] + ROUND * Math.cos(deg(angle)), corner[1] + ROUND * Math.sin(deg(angle)));
  const near = outline.reduce((best, p, i) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(outline[best][0] - cx, outline[best][1] - cy) ? i : best), 0);
  for (let n = 0; n < 4; n++) {
    const [ex, ey] = outline[(near + Math.round(r(-10, 10)) + outline.length) % outline.length];
    const toCenter = Math.hypot(300 - ex, 170 - ey), inset = r(4, 8);
    const x = ex + ((300 - ex) / toCenter) * inset, y = ey + ((170 - ey) / toCenter) * inset;
    tuftList.push({y, svg: edgeCluster(x, y, side === 'split' ? Math.sign(x - cx) || 1 : side)});
  }
}

// back to front, so a tall clump never covers one standing in front of it
const tufts = tuftList.sort((a, b) => a.y - b.y).map((t) => t.svg).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" width="600" height="420">
  <defs>
    <radialGradient id="gi-top" cx="300" cy="170" r="260" gradientUnits="userSpaceOnUse" gradientTransform="translate(300 170) scale(1 0.5) translate(-300 -170)">
      <stop offset="0" stop-color="#a8844e"/>
      <stop offset="0.45" stop-color="#ad9150"/>
      <stop offset="0.75" stop-color="#93964a"/>
      <stop offset="1" stop-color="#6d9638"/>
    </radialGradient>
    <linearGradient id="gi-soil" x1="0" y1="0" x2="0" y2="${D + 12}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5e4351"/>
      <stop offset="1" stop-color="#3e2b3a"/>
    </linearGradient>
    <linearGradient id="gi-turn" x1="${300 - ROUND * 220}" y1="0" x2="${300 + ROUND * 220}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.28"/>
    </linearGradient>
    <filter id="gi-bleed" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="gi-soft" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>
    <filter id="gi-blur-wide" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="gi-blur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
    <filter id="gi-shadow-blur" x="-15%" y="-40%" width="130%" height="180%"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <path id="shadow" d="${pathOf(outline, true)}" fill="#000" opacity="0.6" transform="translate(0 ${D + SHADOW_DROP}) translate(300 170) scale(${SHADOW_SPREAD}) translate(-300 -170)" filter="url(#gi-shadow-blur)"/>
  ${cliff()}
  <g id="top">
    <path d="${pathOf(outline, true)}" fill="url(#gi-top)"/>
    <g id="grit">${grit}</g>
    <g id="pebbles">${pebbles}</g>
    <g id="tufts">${tufts}</g>
  </g>
</svg>
`;
writeFileSync(process.argv[2], svg);
