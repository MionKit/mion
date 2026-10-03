# Composes the horned ghost v2: head, horn, eyes, tongue, body, legs and tail, over the traced body outline.
import json, math, sys
eyes = json.load(open('eyes.json'))
SILHOUETTE = json.load(open('body-outline.json'))['silhouette']

HEAD = dict(cx=97.7, cy=166.2, rx=64, ry=67.2, rot=154)
head_el = lambda extra='': f'<ellipse cx="{HEAD["cx"]}" cy="{HEAD["cy"]}" rx="{HEAD["rx"]}" ry="{HEAD["ry"]}" transform="rotate({HEAD["rot"]} {HEAD["cx"]} {HEAD["cy"]}){extra}"/>'
def head_tone(fill, dx, dy, s):  # lighter copy of the head, shrunk toward its center and nudged up-left
    cx, cy = HEAD['cx'], HEAD['cy']
    return f'<g transform="translate({dx} {dy}) translate({cx} {cy}) scale({s}) translate({-cx} {-cy})" fill="{fill}">{head_el()}</g>'

def head_point(deg):  # point on the head outline, angle in screen degrees
    a = math.radians(deg); r = 65.2
    return HEAD['cx'] + r * math.cos(a), HEAD['cy'] + r * math.sin(a)
def arc(d0, d1, steps=8):
    pts = [head_point(d0 + (d1 - d0) * i / steps) for i in range(steps + 1)]
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts)

# horn rings, base first: center, half width, half height
TILT = 15
RINGS = [(128, 104, 34.5, 14.5), (132, 90, 33, 13.5), (137.5, 76, 29.5, 12.5), (142, 62, 27, 11.5), (145.5, 48, 24.5, 10.5), (153.5, 35, 18.5, 11)]
import random
rand = random.Random(11)
SHAPES = []
for _ in RINGS:  # per ring: a few slow bumps, its own tilt and a small sideways shift
    SHAPES.append(dict(waves=[(k, rand.uniform(0.03, 0.09) / k ** 0.6, rand.uniform(0, 6.28)) for k in (2, 3, 5)],
                       tilt=TILT + rand.uniform(-5, 5), dx=rand.uniform(-1.5, 1.5)))
look = random.Random(23)  # own stream: shading changes never move the ring shapes
for shape in SHAPES:
    shape.update(shadow=(look.uniform(-1, 2.5), look.uniform(2, 4.5)), shadow_fill=look.choice(['#2a6072', '#2f6779', '#245566', '#33707f']),
                 light=(look.uniform(-6, -2), look.uniform(-4, -1.5), look.uniform(0.78, 0.92)), light_fill=look.choice(['#74bcca', '#6cb4c3', '#7cc3cf']),
                 shine=look.random() < 0.8, shine_at=(look.uniform(-0.75, -0.3), look.uniform(-0.2, 0.45)), shine_size=look.uniform(0.14, 0.28))
def ring_d(i, cx, cy, rx, ry):
    return blob_d(SHAPES[i], cx, cy, rx, ry)
def blob_d(shape, cx, cy, rx, ry, n=28):
    cx += shape['dx']
    t, cs, sn = math.radians(shape['tilt']), math.cos(math.radians(shape['tilt'])), math.sin(math.radians(shape['tilt']))
    pts = []
    for j in range(n):
        a = 2 * math.pi * j / n
        k = 1 + sum(amp * math.sin(f * a + ph) for f, amp, ph in shape['waves'])
        x, y = rx * k * math.cos(a), ry * k * math.sin(a)
        pts.append((cx + x * cs - y * sn, cy + x * sn + y * cs))
    d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}'
    for j in range(n):  # Catmull-Rom through the points keeps every bump round
        p0, p1, p2, p3 = pts[j - 1], pts[j], pts[(j + 1) % n], pts[(j + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
    return d + 'Z'
horn_clips = ''
horn = ''
def shine(s, cx, cy, rx, ry):
    if not s['shine']: return ''
    x, y = cx + rx * s['shine_at'][0], cy + ry * s['shine_at'][1]
    return f'<ellipse fill="#93d6de" cx="{x:.1f}" cy="{y:.1f}" rx="{rx * s["shine_size"]:.1f}" ry="{ry * s["shine_size"] * 1.2:.1f}" transform="rotate({s["tilt"] + 25:.0f} {x:.1f} {y:.1f})"/>'
for i, (cx, cy, rx, ry) in enumerate(RINGS):
    s = SHAPES[i]
    horn_clips += f'<path id="hg2-ring-shape-{i}" d="{ring_d(i, cx, cy, rx, ry)}"/><clipPath id="hg2-ring-{i}"><use href="#hg2-ring-shape-{i}"/></clipPath>'
    horn += f'''
    <g class="ring" id="ring-{i}">
      <g fill="{s['shadow_fill']}" transform="translate({s['shadow'][0]:.1f} {s['shadow'][1]:.1f})"><use href="#hg2-ring-shape-{i}"/></g>
      <g fill="#579cae"><use href="#hg2-ring-shape-{i}"/></g>
      <g clip-path="url(#hg2-ring-{i})">
        <g fill="{s['light_fill']}" transform="translate({cx + s['light'][0]:.1f} {cy + s['light'][1]:.1f}) scale({s['light'][2]:.2f}) translate({-cx} {-cy})"><use href="#hg2-ring-shape-{i}"/></g>
        {shine(s, cx, cy, rx, ry)}
      </g>
    </g>'''

def eye(name, e):
    return f'''
    <g id="eye-{name}">
      <path fill="#5a5d6d" d="{e["rim"]}"/>
      <path fill="#f7f5f2" d="{e["white"]}"/>
      <path fill="#2d3344" d="{e["pupil"]}"/>
    </g>'''

# stubby legs drawn over the body, starting inside it and poking a little past the bottom: hip x, y, length, hip and foot half widths, lean, is back
LEGS = [(204, 274, 18, 9.5, 8, -22, True), (81, 281, 20, 11, 9.5, 20, False), (131, 293, 17, 12.5, 11, -3, False)]
leg_rand = random.Random(53)   # own stream: odd leg shapes never move anything else
LEG_SHAPES = [dict(bulge=(leg_rand.uniform(-1.5, 3), leg_rand.uniform(-1.5, 3)), flare=leg_rand.uniform(-1, 3.5), bend=leg_rand.uniform(-5, 5),
                   waves=[(k, leg_rand.uniform(0.3, 1.1), leg_rand.uniform(0, 6.28)) for k in (2, 3)]) for _ in range(4)]
del LEG_SHAPES[1]   # that leg was dropped; the others keep their shapes
LEG_ODDNESS = 0.5   # how much of each leg's random bulge, flare, bend and wobble to use
def leg_d(length, a, b, shape=None, n=10):
    shape = shape or dict(bulge=(0, 0), flare=0, bend=0, waves=[])
    k = LEG_ODDNESS
    shape = dict(bulge=(shape['bulge'][0] * k, shape['bulge'][1] * k), flare=shape['flare'] * k, bend=shape['bend'] * k,
                 waves=[(f, amp * k, ph) for f, amp, ph in shape['waves']])
    pts_left, pts_right = [], []
    for j in range(n + 1):  # walk down the leg: a bending center line, each side with its own bulge, and a flaring foot
        s = j / n
        cx = shape['bend'] * s * s + sum(amp * 0.5 * math.sin(k * math.pi * s + ph) for k, amp, ph in shape['waves'])
        base = a + (b - a) * s + shape['flare'] * s ** 4
        pts_left.append((cx - base - shape['bulge'][0] * math.sin(math.pi * s), length * s))
        pts_right.append((cx + base + shape['bulge'][1] * math.sin(math.pi * s), length * s))
    foot = [(pts_left[-1][0] + (pts_right[-1][0] - pts_left[-1][0]) * (1 - math.cos(math.pi * t / 6)) / 2, length + (pts_right[-1][0] - pts_left[-1][0]) / 2 * 0.9 * math.sin(math.pi * t / 6)) for t in range(1, 6)]
    top = [(pts_right[0][0] + (pts_left[0][0] - pts_right[0][0]) * (1 - math.cos(math.pi * t / 6)) / 2, -(pts_right[0][0] - pts_left[0][0]) / 2 * math.sin(math.pi * t / 6)) for t in range(1, 6)]
    pts = pts_left + foot + pts_right[::-1] + top
    m = len(pts)
    d = f'M{pts[0][0]:.1f} {pts[0][1]:.1f}'
    for i in range(m):  # Catmull-Rom keeps every bump round
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % m], pts[(i + 2) % m]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
    return d + 'Z'
def leg(i, x, y, length, a, b, lean, back):
    base, light = ('#8a7f80', '#a19696') if back else ('#9d9190', '#bcb1ad')
    return f'''
    <g class="leg" id="leg-{i}" transform="translate({x} {y}) rotate({lean})">{'' if back else f'<g mask="url(#hg2-leg-fade-{i})">'}
      <use href="#hg2-leg-shape-{i}" fill="{base}"/>
      <g clip-path="url(#hg2-leg-{i})"><use href="#hg2-leg-shape-{i}" fill="{light}" transform="translate(-2.5 -1.5) scale(0.82 1)"/></g>
      <path d="M{-b * 0.5:.1f} {length - b * 0.6:.1f} Q{-b * 0.75:.1f} {length + b * 0.1:.1f} {-b * 0.2:.1f} {length + b * 0.55:.1f}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="{0.3 if back else 0.55}"/>{'' if back else '</g>'}
    </g>'''
# tail: three rounded, uneven trapezoids stacked from the base up: center, bottom width, top width, height
TAIL = [(214, 255, 27, 22, 19), (220.5, 238, 21, 16, 17), (226, 222, 15, 10, 15)]
tail_rand, tail_look = random.Random(41), random.Random(37)
TAIL_SHAPES = [dict(tilt=17 + tail_rand.uniform(-7, 7), corners=[(tail_rand.uniform(-2, 2), tail_rand.uniform(-1.5, 1.5)) for _ in range(4)],
                    round=tail_rand.uniform(0.32, 0.45)) for _ in TAIL]
for shape in TAIL_SHAPES:
    shape.update(shadow=(tail_look.uniform(-0.5, 1.5), tail_look.uniform(1.5, 3)), shadow_fill=tail_look.choice(['#6a567c', '#735f86', '#62506f']),
                 light=(tail_look.uniform(-4, -1.5), tail_look.uniform(-3, -1), tail_look.uniform(0.76, 0.9)), light_fill=tail_look.choice(['#d3c3da', '#cdbdd6', '#d8c9dd']),
                 shine=tail_look.random() < 0.7, shine_at=(tail_look.uniform(-0.7, -0.3), tail_look.uniform(-0.2, 0.4)), shine_size=tail_look.uniform(0.16, 0.28))
CURL = [8, 26, 46]   # each segment turns further than the one below it
for j, shape in enumerate(TAIL_SHAPES): shape['tilt'] = CURL[j]
for j in range(1, len(TAIL)):  # stack each segment on the top edge of the one below, along the turned axis
    px, py, _, _, ph = TAIL[j - 1]; _, _, wb, wt, h = TAIL[j]
    a = math.radians((CURL[j - 1] + CURL[j]) / 2); step = (ph + h) / 2 - 2
    TAIL[j] = (px + math.sin(a) * step, py - math.cos(a) * step, wb, wt, h)
def trap_d(shape, cx, cy, wb, wt, h):
    t = math.radians(shape['tilt']); cs, sn = math.cos(t), math.sin(t)
    local = [(-wb / 2, h / 2), (-wt / 2, -h / 2), (wt / 2, -h / 2), (wb / 2, h / 2)]
    pts = [(cx + (x + jx) * cs - (y + jy) * sn, cy + (x + jx) * sn + (y + jy) * cs) for (x, y), (jx, jy) in zip(local, shape['corners'])]
    k = shape['round']; n = len(pts)
    mid = lambda p, q, f: (p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f)
    d = ''
    for i in range(n):  # cut each corner back along both edges and bend through it, so no corner is sharp
        prev, cur, nxt = pts[i - 1], pts[i], pts[(i + 1) % n]
        a, b = mid(cur, prev, k), mid(cur, nxt, k)
        d += (f'M{a[0]:.1f} {a[1]:.1f}' if i == 0 else f'L{a[0]:.1f} {a[1]:.1f}') + f'Q{cur[0]:.1f} {cur[1]:.1f} {b[0]:.1f} {b[1]:.1f}'
    return d + 'Z'
def tail():
    out = ''
    for j, (cx, cy, wb, wt, h) in enumerate(TAIL):
        s = TAIL_SHAPES[j]
        rx, ry = (wb + wt) / 4, h / 2
        x, y = cx + rx * s['shine_at'][0], cy + ry * s['shine_at'][1]
        shine_el = f'<ellipse fill="#f1e9f3" cx="{x:.1f}" cy="{y:.1f}" rx="{rx * s["shine_size"]:.1f}" ry="{ry * s["shine_size"] * 1.2:.1f}" transform="rotate({s["tilt"] - 70:.0f} {x:.1f} {y:.1f})"/>' if s['shine'] else ''
        out += f'''
    <g class="tail-segment" id="tail-{j}">
      <use href="#hg2-tail-shape-{j}" fill="{s['shadow_fill']}" transform="translate({s['shadow'][0]:.1f} {s['shadow'][1]:.1f})"/>
      <use href="#hg2-tail-shape-{j}" fill="#b6a2c3"/>
      <g clip-path="url(#hg2-tail-{j})">
        <use href="#hg2-tail-shape-{j}" fill="{s['light_fill']}" transform="translate({cx + s['light'][0]:.1f} {cy + s['light'][1]:.1f}) scale({s['light'][2]:.2f}) translate({-cx} {-cy})"/>
        {shine_el}
      </g>
    </g>'''
    return out
# front legs: the top starts see-through and turns solid partway down, so it melts into the body
LEG_FADES = ''.join(f'<linearGradient id="hg2-leg-fade-g{i}" gradientUnits="userSpaceOnUse" x1="0" y1="{-l[3]}" x2="0" y2="{l[2] * 0.6:.1f}"><stop offset="0" stop-color="#333"/><stop offset="1" stop-color="#fff"/></linearGradient>'
                    f'<mask id="hg2-leg-fade-{i}" maskUnits="userSpaceOnUse" x="-40" y="-40" width="80" height="90"><rect x="-40" y="-40" width="80" height="90" fill="url(#hg2-leg-fade-g{i})"/></mask>'
                    for i, l in enumerate(LEGS) if not l[-1])
def foot_shadow(x, y, length, a, b, lean, back):  # under the tip of the foot, wherever the leg's lean puts it
    t = math.radians(lean); reach = length + b
    fx, fy = x - reach * math.sin(t), y + reach * math.cos(t) - 2
    return f'<ellipse cx="{fx:.1f}" cy="{fy:.1f}" rx="{b * 1.3:.1f}" ry="{b * 0.45:.1f}"/>'
TONGUE = 'M-12 -8 C-13.5 10 -12.5 26 -9 33 C-5.5 40.5 5.5 40.5 9 33 C12.5 26 13.5 10 12 -8 Z'
TONGUE_AT = 'translate(55 212) rotate(42)'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 274 334" width="274" height="334">
  <defs>
    <filter id="hg2-shadow-blur" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="hg2-feet-blur" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="0.9"/></filter>
    <clipPath id="hg2-head-clip">{head_el()}</clipPath>
    {horn_clips}
    <path id="hg2-silhouette" d="{SILHOUETTE}"/><clipPath id="hg2-silhouette-clip"><use href="#hg2-silhouette"/></clipPath>
    {''.join(f'<path id="hg2-leg-shape-{i}" d="{leg_d(*l[2:5], LEG_SHAPES[i])}"/><clipPath id="hg2-leg-{i}"><use href="#hg2-leg-shape-{i}"/></clipPath>' for i, l in enumerate(LEGS))}
    {''.join(f'<path id="hg2-tail-shape-{j}" d="{trap_d(TAIL_SHAPES[j], *t)}"/><clipPath id="hg2-tail-{j}"><use href="#hg2-tail-shape-{j}"/></clipPath>' for j, t in enumerate(TAIL))}
{LEG_FADES}
    <clipPath id="hg2-tongue-clip"><path d="{TONGUE}"/></clipPath>
    <mask id="hg2-body-mask"><rect width="274" height="334" fill="#fff"/><path d="M90 18 H178 V108 H90 Z M36 82 H74 V124 H36 Z M26 190 L72 212 L72 266 L24 266 Z" fill="#000"/></mask>
  </defs>
  <g id="shadow" fill="#000">
    <ellipse id="shadow-body" cx="146" cy="311" rx="80" ry="12" opacity="0.32" filter="url(#hg2-shadow-blur)"/>
    <g id="shadow-feet" opacity="0.45" filter="url(#hg2-feet-blur)">{''.join(foot_shadow(*l) for l in LEGS)}</g>
  </g>
  <g id="legs-back">{''.join(leg(i, *l) for i, l in enumerate(LEGS) if l[-1])}
  </g>
  <g id="tail" transform="translate(-3 0) rotate(55 214 262)">{tail()}
  </g>
  <g id="body-traced" clip-path="url(#hg2-silhouette-clip)">
    <g mask="url(#hg2-body-mask)">
      <g id="body-tones">
        <use href="#hg2-silhouette" fill="#8f91a4"/>
        <use href="#hg2-silhouette" fill="#a4a6b5" transform="translate(-2 -7)"/>
        <path id="body-light" d="M74 262 C70 248 82 238 96 233 C120 222 150 202 172 191 C184 185 192 197 190 211 C186 238 178 250 160 256 C130 266 96 272 80 268 C76 267 75 265 74 262 Z" fill="#c5c6d0"/>
        <g id="body-spots">
          <ellipse cx="112" cy="262" rx="5.5" ry="4" fill="#e3c5b0" opacity="0.8"/>
          <circle cx="150" cy="250" r="2.4" fill="#e9dc9a"/>
          <circle cx="176" cy="232" r="2" fill="#ffffff"/>
          <circle cx="99" cy="286" r="2.2" fill="#e9a3a8"/>
          <ellipse cx="165" cy="273" rx="7" ry="4.5" fill="#b3b5c2" opacity="0.7"/>
          <circle cx="191" cy="258" r="1.8" fill="#ffffff" opacity="0.8"/>
        </g>
      </g>
    </g>
  </g>
  <g id="legs-front">{''.join(leg(i, *l) for i, l in enumerate(LEGS) if not l[-1])}
  </g>
  <g id="tongue" transform="{TONGUE_AT}">
    <path d="{TONGUE}" fill="#e0899a"/>
    <g clip-path="url(#hg2-tongue-clip)">
      <path d="{TONGUE}" fill="#f2a8b4" transform="translate(-2.5 -1) scale(0.84)"/>
      <ellipse cx="0" cy="-3" rx="14" ry="7" fill="#c46a7c"/>
    </g>
    <path id="tongue-line" d="M0.5 4 Q1.4 17 0.3 29" fill="none" stroke="#b85f72" stroke-width="2.2" stroke-linecap="round"/>
    <path id="tongue-shine" d="M-7.5 6 Q-8.6 17 -6.2 26" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  </g>
  <g id="head">
    <g fill="#a9acb9">{head_el()}</g>
    <g clip-path="url(#hg2-head-clip)">
      {head_tone('#c3c4cb', -4, -5, 0.95)}
      {head_tone('#dcdce0', -11, -14, 0.82)}
      {head_tone('#f4f2ef', -20, -24, 0.62)}
      <g id="head-spots">
        <ellipse cx="60" cy="176" rx="6" ry="4.5" fill="#e3c5b0" opacity="0.8"/>
        <circle cx="93" cy="164" r="2.6" fill="#e9dc9a"/>
        <circle cx="86" cy="207" r="2.2" fill="#ffffff"/>
        <circle cx="163" cy="187" r="2.4" fill="#e9a3a8"/>
        <ellipse cx="102" cy="134" rx="7" ry="5" fill="#cfd0d6" opacity="0.7"/>
      </g>
    </g>
    <path id="head-line" d="{arc(28, 98)}" fill="none" stroke="#5f6071" stroke-width="2.4" stroke-linecap="round"/>
  </g>
  <g id="horn">{horn}
  </g>
  <g id="eyes">{eye('small', eyes['small'])}{eye('big', eyes['big'])}
  </g>
</svg>
'''
open(sys.argv[1], 'w').write(svg)
print(len(svg) // 1024, 'KB')
