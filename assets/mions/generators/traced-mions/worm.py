# The worm mion, built by hand: one tapered tube along its curve with a lighter top, curved creases between segments, a shine and two eyes.
import math
from common import through

OUT = '../../creatures/worm.svg'
# the curve measured on the reference crop, head first: center and half thickness
SPINE = [(46, 52, 21), (61, 70, 21), (79, 87, 20.5), (99, 101, 19.5), (119, 112, 18.5), (137, 119, 17), (151, 123, 14.5)]

def frame(i):  # direction along the worm and across it at spine point i
    nx, ny, _ = SPINE[min(i + 1, len(SPINE) - 1)]; px, py, _ = SPINE[max(i - 1, 0)]
    a = math.atan2(ny - py, nx - px)
    return (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))

def tube(shrink=1.0, shift=(0, 0)):
    # one side down the worm, a round tail, back up the other side, a round head
    left, right = [], []
    for i, (x, y, r) in enumerate(SPINE):
        _, (ax, ay) = frame(i); r *= shrink
        left.append((x + ax * r + shift[0], y + ay * r + shift[1])); right.append((x - ax * r + shift[0], y - ay * r + shift[1]))
    def cap(i, tip):  # half a circle from one side to the other, out through the tip direction
        (dx, dy), (ax, ay) = frame(i); x, y, r = SPINE[i]; r *= shrink
        side = 1 if tip > 0 else -1   # the tail cap runs from the left side to the right, the head cap back again
        return [(x + shift[0] + (side * ax * math.cos(t) + tip * dx * math.sin(t)) * r, y + shift[1] + (side * ay * math.cos(t) + tip * dy * math.sin(t)) * r)
                for t in (math.pi * k / 6 for k in range(1, 6))]
    tail, head = cap(len(SPINE) - 1, 1), cap(0, -1)
    return through(left + tail + right[::-1] + head)

creases = ''
for i in range(1, len(SPINE) - 1):   # between segments: an arc across the tube, bowing toward the tail
    x, y, r = SPINE[i]; (dx, dy), (ax, ay) = frame(i)
    x, y = x - dx * 9, y - dy * 9
    a, b = (x + ax * r * 0.92, y + ay * r * 0.92), (x - ax * r * 0.92, y - ay * r * 0.92)
    c = (x + dx * r * 0.45, y + dy * r * 0.45)
    creases += f'<path d="M{a[0]:.0f} {a[1]:.0f}Q{c[0]:.0f} {c[1]:.0f} {b[0]:.0f} {b[1]:.0f}"/>'

shine = 'M' + ' '.join(f'{x - frame(i)[1][0] * r * 0.55:.0f} {y - frame(i)[1][1] * r * 0.55:.0f}' for i, (x, y, r) in enumerate(SPINE[:4]))

def eye(i, x, y, r, p):
    return f'''
    <g id="eye-{i}">
      <circle cx="{x}" cy="{y}" r="{r + 1.4}" fill="#a64a55"/>
      <circle cx="{x}" cy="{y}" r="{r}" fill="#f6f4f1"/>
      <g><circle cx="{x + 0.5}" cy="{y + 0.5}" r="{p}" fill="#1d1f2b"/><circle cx="{x - p * 0.3:.1f}" cy="{y - p * 0.35:.1f}" r="{max(1.1, p * 0.3):.1f}" fill="#fff"/></g>
    </g>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 175 160" width="175" height="160">
  <defs>
    <filter id="worm-blur" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="3.5"/></filter>
    <clipPath id="worm-clip"><path d="{tube()}"/></clipPath>
  </defs>
  <g id="shadow"><path d="M30 92 Q90 150 165 142 Q172 133 160 128 Q95 128 42 72 Z" fill="#000" opacity="0.28" filter="url(#worm-blur)"/></g>
  <g id="body">
    <path d="{tube()}" fill="#b9505c"/>
    <g clip-path="url(#worm-clip)">
      <path d="{tube(0.82, (-2, -4))}" fill="#d96d74"/>
      <path d="{tube(0.45, (-5, -8))}" fill="#eb9296"/>
    </g>
    <g id="creases" fill="none" stroke="#8a3a48" stroke-width="2.2" stroke-linecap="round" clip-path="url(#worm-clip)">{creases}</g>
    <path id="gloss" d="{shine}" fill="none" stroke="#ffd9d6" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  </g>
  <g id="eyes">{eye(0, 36, 47, 5.4, 3)}{eye(1, 53, 40, 6, 3.3)}
  </g>
</svg>
'''
open(OUT, 'w').write(svg)
print('worm', f'{len(svg) / 1024:.1f} KB')
