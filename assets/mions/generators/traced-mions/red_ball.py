# The red ball mion, built by hand: a lumpy ball with a lip bulging out at the lower left, thin tapered legs, a mouth dot and one big lumpy eye.
import random, re
import cv2, numpy as np
from common import wobbly, through

rand = random.Random(7)
bumps = lambda size, rand=rand: [(k, rand.uniform(0.01, size) / k ** 0.5, rand.uniform(0, 6.28)) for k in (2, 3, 4)]

def curve(d, per=10):  # points along a compact path from through(): absolute start, then relative cubic segments
    nums = [float(v) for v in re.findall(r'-?\d*\.?\d+', d)]
    at, out = np.array(nums[:2]), []
    for i in range(2, len(nums) - 5, 6):
        c1, c2, end = (at + np.array(nums[i + k:i + k + 2]) for k in (0, 2, 4))
        out += [(1 - t) ** 3 * at + 3 * t * (1 - t) ** 2 * c1 + 3 * t * t * (1 - t) * c2 + t ** 3 * end for t in np.arange(per) / per]
        at = end
    return np.array(out)

def merged(paths, n=26, sigma=3.5, up=4):
    # the outline of several overlapping shapes as one, with the dents where they meet softened, so no sharp inner corner shows
    mask = np.zeros((260 * up, 220 * up), np.uint8)
    for d in paths: cv2.fillPoly(mask, [np.round(curve(d) * up).astype(np.int32)], 1)
    edge = max(cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=len)[:, 0].astype(float)
    k = np.exp(-0.5 * (np.arange(-3 * sigma * up, 3 * sigma * up + 1) / (sigma * up)) ** 2); k /= k.sum(); pad = len(k) // 2
    wrap = np.concatenate([edge[-pad:], edge, edge[:pad]])
    soft = np.stack([np.convolve(wrap[:, i], k, 'valid') for i in range(2)], 1)
    return through(soft[np.linspace(0, len(soft), n, endpoint=False).astype(int)] / up, digits=1)

def body():
    # one silhouette, the ball and the lip bulging at its lower left, in the darkest tone; lighter tones nudged up-left and clipped to it
    own = random.Random(73)   # its own stream, so the silhouette never shifts when another part changes
    ball, lip = wobbly(103, 91.5, 71.5, 67.5, -12, bumps(0.03, own)), wobbly(85, 132, 58, 36, 4, bumps(0.03, own), box=2.2)
    return f'''
  <g id="rb-body">
    <defs><path id="rb-shape" d="{merged([ball, lip])}"/><clipPath id="rb-body-clip"><use href="#rb-shape"/></clipPath></defs>
    <use href="#rb-shape" fill="#8f3638"/>
    <g clip-path="url(#rb-body-clip)">
      <use href="#rb-shape" fill="#b04340" transform="translate(30 88) scale(0.94) translate(-30 -90)"/>
      <path d="{wobbly(50, 60, 80, 74, 25, bumps(0.04, own), n=10)}" fill="#e17163"/>
      <path d="{wobbly(69, 39, 60, 45, 20, bumps(0.05, own), n=10)}" fill="#f5a283"/>
      <ellipse cx="120" cy="49.5" rx="7.5" ry="4.5" fill="#fbd4b9" transform="rotate(28 120 49.5)"/>
    </g>
  </g>'''

def leg(p0, p1, p2, top, bottom):  # a quadratic stroke drawn as a filled taper, round at both ends
    p0, p1, p2 = (np.array(p, float) for p in (p0, p1, p2))
    ts = np.linspace(0, 1, 4)
    mid = [(1 - t) ** 2 * p0 + 2 * t * (1 - t) * p1 + t * t * p2 for t in ts]
    tan = [2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1) for t in ts]
    side = [np.array([-d[1], d[0]]) / np.hypot(*d) for d in tan]
    half = [top + (bottom - top) * t for t in ts]
    left = [m + s * w / 2 for m, s, w in zip(mid, side, half)]
    right = [m - s * w / 2 for m, s, w in zip(mid, side, half)]
    tip = mid[-1] + tan[-1] / np.hypot(*tan[-1]) * bottom * 0.45
    return through(left + [tip] + right[::-1], digits=1)

def back():  # both legs behind the ball, each ending in a small flat foot
    return f'''
  <g id="rb-legs" fill="#3b3245">
    <path d="{leg((94, 156), (91, 176), (86, 191), 4.2, 2.6)}"/>
    <path d="{leg((108, 158), (111, 177), (115, 190), 4.2, 2.6)}"/>
    <ellipse cx="85" cy="192.5" rx="4.8" ry="2.5"/>
    <ellipse cx="116.5" cy="191.5" rx="4.8" ry="2.5"/>
  </g>'''

def eye(i, x, y, rx, ry, tilt, rim, white, pupil):
    # the rim is the white's own shape pushed down-right, so it shows as a crescent there and the upper left has no border
    b = bumps(0.04)
    px, py, prx, pry, ptilt = pupil
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1.5, y + 2, rx + 1.8, ry + 1.8, tilt, b)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, tilt, b)}"/>
      <g><path fill="#272a37" d="{wobbly(px, py, prx, pry, ptilt, bumps(0.04), n=10)}"/><path fill="#686c7d" d="{wobbly(px + 1.6, py + 1.4, prx * 0.62, pry * 0.6, ptilt, bumps(0.04), n=8)}"/><circle cx="{px + 2.5}" cy="{py - 5}" r="1.5" fill="#fff"/></g>
    </g>'''

def lid_shade(x, y, rx, ry, tilt):  # a grey band inside the white's lower right, kept still in front of the pupil
    t, a = np.radians(tilt), np.radians(np.linspace(-10, 110, 5))
    pts = [(x + u * np.cos(t) - v * np.sin(t), y + u * np.sin(t) + v * np.cos(t)) for u, v in zip((rx - 2.6) * np.cos(a), (ry - 2.6) * np.sin(a))]
    return f'''
  <path id="rb-lid" d="{through(pts, closed=False, digits=1)}" fill="none" stroke="#b9b5c4" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/>'''

def extra():
    return body() + f'''
  <g id="rb-spots" fill="none" stroke-linecap="round">
    <circle cx="144" cy="57.5" r="3.6" fill="#fbe3df"/>
    <ellipse cx="154" cy="72.5" rx="2.2" ry="3.8" stroke="#e7a39c" stroke-width="1.4"/>
    <ellipse cx="140.5" cy="80.5" rx="7.2" ry="4" fill="#dc958b"/><ellipse cx="141" cy="82.6" rx="5" ry="2.7" fill="#a8403e"/>
    <path d="M137.5 101.5Q135.5 110 140 112.5Q142.5 113 143 110" stroke="#f3c2ab" stroke-width="2.4"/>
    <path d="M35 117.5Q43 122 52.5 123.5" stroke="#a03b40" stroke-width="1.8"/>
  </g>
  <g id="rb-mouth">
    <path fill="#5e2b30" d="{wobbly(62, 149.3, 6.2, 6.6, -20, bumps(0.05), n=8)}"/>
    <path fill="#f6f2ee" d="{wobbly(61.5, 148, 4.8, 5.4, -20, bumps(0.05), n=8)}"/>
    <circle cx="62.3" cy="149" r="2.3" fill="#3a3036"/>
  </g>
  <g id="rb-eyes">{eye(0, 65, 83, 29, 25.5, -25, '#6e2a2c', '#f4f5f8', (47.5, 87, 12.5, 7.5, -60))}
  </g>{lid_shade(65, 83, 29, 25.5, -25)}'''
