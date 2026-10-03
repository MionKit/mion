// Generates the two sky layers, stars and floating pebbles, with seeded randomness so the layout never reshuffles.
// Run from assets/mions: node generators/sky.mjs
import {writeFileSync} from 'node:fs';

const SIZE = 1000; // matches the scene: one unit per pixel of the half-size reference image
const f = (n) => +n.toFixed(1);

function stream(seed) {
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return {rnd, r: (a, b) => a + rnd() * (b - a), pick: (arr) => arr[Math.floor(rnd() * arr.length)]};
}

// a four-pointed sparkle: thin arms bowing in to a narrow waist, each point ending in a small round cap
function sparkle(cx, cy, size, waist) {
  const tip = size * 0.07, w = size * waist;
  const pts = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // outward directions of the four points
  const at = (x, y) => `${f(cx + x)} ${f(cy + y)}`;
  let d = '';
  pts.forEach(([ox, oy], i) => {
    const [sx, sy] = [-oy, ox]; // across the point
    const reach = size - tip;
    const left = [ox * reach - sx * tip, oy * reach - sy * tip], right = [ox * reach + sx * tip, oy * reach + sy * tip];
    if (i === 0) d += `M${at(...left)}`;
    d += `Q${at(ox * (size + tip), oy * (size + tip))} ${at(...right)}`; // the rounded cap
    const [nx, ny] = pts[(i + 1) % 4], [nsx, nsy] = [-ny, nx];
    const next = [nx * reach - nsx * tip, ny * reach - nsy * tip];
    const mx = (ox + nx) / Math.SQRT2, my = (oy + ny) / Math.SQRT2;
    d += `Q${at(mx * w, my * w)} ${at(...next)}`; // bow in to the waist on the way to the next point
  });
  return d + 'Z';
}

function stars() {
  const {rnd, r} = stream(3);
  let dots = '';
  for (let i = 0; i < 420; i++) dots += `<circle cx="${f(rnd() * SIZE)}" cy="${f(rnd() * SIZE)}" r="${f(r(0.5, 1.8))}" opacity="${f(r(0.3, 0.9))}"/>`;
  let shine = '';
  for (let i = 0; i < 36; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, size = r(3, 8);
    shine += `<path class="sparkle" style="--d:${f(-r(0, 4))}s" d="${sparkle(x, y, size, r(0.1, 0.16))}" opacity="${f(r(0.6, 1))}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <g id="sky-stars" fill="#fff">
    <g id="star-dots">${dots}</g>
    <g id="sparkles">${shine}</g>
  </g>
</svg>
`;
}

function pebbles() {
  const {rnd, r, pick} = stream(11);
  const colors = ['#8fb8d8', '#e3a18a', '#c9a7d9', '#9fd0c8', '#f0c47a'];
  const light = (hex) => '#' + hex.slice(1).match(/../g).map((c) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * 0.35).toString(16).padStart(2, '0')).join('');
  let out = '';
  for (let i = 0; i < 90; i++) {
    const x = f(rnd() * SIZE), y = f(rnd() * SIZE), rx = r(3, 9), tilt = f(r(-25, 25)), c = pick(colors);
    // flat stone: the pebble, then a smaller lighter copy nudged up-left
    out += `<g transform="translate(${x} ${y}) rotate(${tilt})" opacity="${f(r(0.65, 0.95))}"><ellipse rx="${f(rx)}" ry="${f(rx * 0.6)}" fill="${c}"/><ellipse cx="${f(-rx * 0.2)}" cy="${f(-rx * 0.15)}" rx="${f(rx * 0.55)}" ry="${f(rx * 0.3)}" fill="${light(c)}"/></g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <g id="sky-pebbles">${out}</g>
</svg>
`;
}

writeFileSync('sky/stars.svg', stars());
writeFileSync('sky/pebbles.svg', pebbles());
