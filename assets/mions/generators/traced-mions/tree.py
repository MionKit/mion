# The island's tree-mushroom: traced trunk and roots, with a hand-built cap of uneven stacked blue rings like the horned ghost's horn.
import sys, math, random, numpy as np, cv2
from common import *

out = sys.argv[1]
img, soft = load('tree.png')
h, w = img.shape[:2]

# trunk and roots: the cutout without the neighbours and without the cap, which is drawn by hand on top
NEIGHBOURS = [[(40, 70), (215, 70), (215, 330), (40, 330)],       # red mushroom
              [(0, 250), (150, 250), (150, 420), (0, 420)],       # egg
              [(505, 150), (620, 150), (620, 350), (505, 350)],   # seal
              [(290, 0), (470, 0), (470, 105), (290, 105)],       # creature on the cap
              [(0, 510), (85, 510), (85, 620), (0, 620)],         # worm
              [(555, 555), (620, 555), (620, 660), (555, 660)]]   # creature bottom right
CAP_AREA = [(150, 0), (510, 0), (510, 262), (420, 300), (330, 322), (240, 302), (150, 262)]
trunk = cutout(img, keep=[[(280, 330), (370, 330), (380, 460), (270, 460)]], drop=NEIGHBOURS + [CAP_AREA])
ink = find_ink(soft, trunk, thr=22)
labels, colors = flatten(soft, trunk, 5, paint_over=ink)
trunk_layers = stacked(labels, colors, 5)
ink_col = sample(img, ink) * 0.85

# cap: rings from the base up: center, half width, half height (1x crop units)
RINGS = [(330, 268, 166, 58), (331, 230, 147, 54), (329, 193, 124, 49), (326, 157, 98, 44), (322, 122, 68, 40)]
rand, look = random.Random(5), random.Random(9)
def ring_d(cx, cy, rx, ry, waves, tilt, n=30):
    t = math.radians(tilt); cs, sn = math.cos(t), math.sin(t); pts = []
    for j in range(n):
        a = 2 * math.pi * j / n
        k = 1 + sum(amp * math.sin(f * a + ph) for f, amp, ph in waves)
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        pts.append((cx + x * cs - y * sn, cy + x * sn + y * cs))
    return through(pts)
cap, clips = '', ''
for i, (cx, cy, rx, ry) in enumerate(RINGS):
    waves = [(k, rand.uniform(0.015, 0.045) / k ** 0.5, rand.uniform(0, 6.28)) for k in (2, 3, 5)]
    tilt = rand.uniform(-3, 3)
    d = ring_d(cx, cy, rx, ry, waves, tilt)
    sdx, sdy = look.uniform(-2, 3), look.uniform(5, 9)
    lx, ly, ls = look.uniform(-12, -6), look.uniform(-9, -5), look.uniform(0.8, 0.88)
    shine = look.random() < 0.85
    clips += f'<clipPath id="tm-ring-{i}"><path d="{d}"/></clipPath>'
    sx, sy = cx - rx * look.uniform(0.35, 0.6), cy - ry * look.uniform(0.0, 0.3)
    cap += f'''
    <g class="ring" id="cap-ring-{i}">
      <path d="{d}" fill="{look.choice(['#284e6a', '#2c5675', '#24485f'])}" transform="translate({sdx:.1f} {sdy:.1f})"/>
      <path d="{d}" fill="#4682a6"/>
      <g clip-path="url(#tm-ring-{i})">
        <path d="{d}" fill="{look.choice(['#71b6d3', '#79bdd8', '#6aaecd'])}" transform="translate({cx + lx:.1f} {cy + ly:.1f}) scale({ls:.2f}) translate({-cx} {-cy})"/>
        {f'<ellipse cx="{sx:.0f}" cy="{sy:.0f}" rx="{rx * 0.16:.0f}" ry="{ry * 0.16:.0f}" fill="#9fd8e8" transform="rotate(-20 {sx:.0f} {sy:.0f})"/>' if shine else ''}
      </g>
    </g>'''

# the cap darkens the top of the trunk, and the roots sit in a soft patch of shade on the grass
under = f'<ellipse id="cap-shade" cx="330" cy="318" rx="128" ry="30" fill="#2a1d2c" opacity="0.55" filter="url(#tm-soft)"/>'
ground = f'<ellipse id="tree-ground" cx="345" cy="560" rx="270" ry="85" fill="#000" opacity="0.18" filter="url(#tm-blur)"/>'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w // UP} {h // UP}" width="{w // UP}" height="{h // UP}">
  <defs>
    <filter id="tm-soft" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="tm-blur" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
    {clips}
  </defs>
  <g id="tree-mushroom">
  {ground}
  <g id="trunk">''' + ''.join(f'\n    <path fill="{c}" d="{d}"/>' for c, d in trunk_layers if d) + f'''
    <path id="trunk-lines" fill="{hexc(ink_col)}" d="{region_path(ink, 1.5, 10, 12)}"/>
    {under}
  </g>
  <g id="cap">{cap}
  </g>
  </g>
</svg>
'''
open(out, 'w').write(svg)
print('tree', len(svg) // 1024, 'KB')
