# The rock mion, built by hand: a stone dome with a top facet and two eye holes, a pink cap and knob, on a flat stone tile.
import random, re
import numpy as np
from common import stack, wobbly, through

rand = random.Random(31)
bumps = lambda size, r=rand: [(k, r.uniform(0.01, size) / k ** 0.5, r.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=10):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n))

def outline(points, own, j=0.8):  # a big shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-j, j), y + own.uniform(-j, j)) for x, y in points])

def part(d, cx, cy, rx, ry, tilt=0):  # a ready shape as a stack part
    return dict(d=d, cx=cx, cy=cy, rx=rx, ry=ry, tilt=tilt)

def rounded(pts, k=0.12):  # a polygon with every corner cut back along both edges and bent through, the terrain tiles' corners
    pts = [np.asarray(p, float) for p in pts]; d = ''
    for i, cur in enumerate(pts):
        a, b = cur + (pts[i - 1] - cur) * k, cur + (pts[(i + 1) % len(pts)] - cur) * k
        a, b, q = (np.round(v).astype(int) for v in (a, b, cur))
        d += (f'M{a[0]} {a[1]}' if i == 0 else f'L{a[0]} {a[1]}') + f'Q{q[0]} {q[1]} {b[0]} {b[1]}'
    return d + 'Z'

def blob(name, d, base, line, push, tones, width=2):
    # the dark copy under the base shows as a thin outline, thicker toward `push`; a tone is (colour, path) or ready markup
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{line}" stroke="{line}" stroke-width="{width}" stroke-linejoin="round" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join('\n      ' + (t if isinstance(t, str) else f'<path d="{t[1]}" fill="{t[0]}"/>') for t in tones) + '''
    </g>
  </g>'''

# the tile: side corners and front corner measured, 8 px thick, its top a parallelogram whose back corner hides behind the dome
L, R, B, THICK = np.array([3, 122]), np.array([247, 120]), np.array([125, 189]), 8
DOWN = np.array([0, THICK]); BF = B - DOWN; T = L + R - BF

def back():
    own = random.Random(32)
    ctr = (T + R + BF + L) / 4
    inset = rounded([ctr + (p - ctr) * 0.86 + [-5, -2] for p in (T, R, BF, L)], 0.16)
    # the dome's shadow falls on the tile in front of it and to the right
    shadow = lump(152, 145, 64, 17, -9, own, 0.04)
    gloss = through([L + [10, -4], L + [34, -16.5], L + [58, -28.5]], closed=False)
    # the sides show under the top as a dark band with a lit bevel along the front edges, all clipped to the outline so the corners stay round
    return f'''
  <g id="rk-tile">
    <defs><path id="rk-tile-shape" d="{rounded([T, R, R + DOWN, B, L + DOWN, L], 0.16)}"/><path id="rk-tile-top" d="{rounded([T, R, BF, L], 0.16)}"/>
      <clipPath id="rk-tile-clip"><use href="#rk-tile-shape"/></clipPath><clipPath id="rk-tile-top-clip"><use href="#rk-tile-top"/></clipPath></defs>
    <use href="#rk-tile-shape" fill="#28507f"/>
    <g clip-path="url(#rk-tile-clip)">
      <path fill="#2d5d8e" d="{rounded([BF, R, R + DOWN, B], 0.16)}"/>
      <use href="#rk-tile-top" fill="#5480a6" transform="translate(0 2.6)"/>
    </g>
    <use href="#rk-tile-top" fill="#6890b0"/>
    <g clip-path="url(#rk-tile-top-clip)">
      <path fill="#78a0be" d="{inset}"/>
      <path fill="#4d7497" d="{shadow}"/>
    </g>
    <path d="{gloss}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0.4"/>
  </g>'''

def eye(i, x, y, rx, ry, tilt, rim, hole, inner):
    # the rim, pushed down-right, shows only as a crescent there; the moving glint group must come last
    b = bumps(0.05)
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1.2, y + 1.6, rx + 1.4, ry + 1.4, tilt, b, 10)}"/>
      <path fill="{hole}" d="{wobbly(x, y, rx, ry, tilt, b, 10)}"/>
      <g>{inner}</g>
    </g>'''

def extra():
    own = random.Random(311)   # the dome and its tones take their own stream, so they never shift when a small part changes
    dome_pts = [(110, 53), (136, 50), (160, 52), (168, 60), (176, 68), (185, 77), (194, 85), (202, 92), (206, 100), (209, 112), (209, 124), (205, 134),
                (196, 141), (182, 146), (164, 151), (140, 156), (115, 156), (100, 151), (88, 145), (80, 138), (74, 129), (74, 117), (78, 105), (82, 94),
                (87, 83), (97, 71), (105, 61)]
    # the stone's tones, darkest first: the shaded skirt is the base, then the body above it, the lit left side, the front block with the eyes, the top facet
    body = outline([(60, 40), (220, 40), (222, 126), (205, 127), (188, 130), (168, 134), (144, 138), (120, 140), (108, 143), (98, 147), (86, 142),
                    (70, 140)], own)
    upper_left = outline([(78, 60), (112, 54), (112, 112), (100, 120), (86, 119), (75, 108), (76, 90)], own)
    front_pts = [(110, 97), (140, 94), (168, 89), (186, 86), (199, 91), (206, 101), (208, 117), (204, 126), (190, 129), (168, 132), (145, 136),
                 (122, 137), (108, 134), (102, 124), (102, 108)]
    front = outline(front_pts, own)
    front_lit = lump(150, 108, 38, 13, -6, own, 0.04)
    strip = outline([(98, 60), (112, 56), (113, 80), (112, 100), (111, 118), (110, 133), (103, 132), (100, 118), (97, 100), (93, 84), (94, 70)], own)
    strip_lit = outline([(96, 63), (111, 57), (112, 80), (111, 97), (103, 100), (95, 89), (91, 77)], own)
    right_face = outline([(156, 53), (167, 57), (177, 68), (188, 78), (199, 88), (194, 93), (182, 89), (172, 76), (162, 62)], own)
    facet_pts = [(110, 56), (160, 55), (169, 66), (181, 84), (168, 88), (150, 91), (130, 94), (112, 96)]
    facet = outline(facet_pts, own, 0.5)
    facet_lit = lump(136, 63, 26, 7, -3, own, 0.05)
    neck = lump(135, 53.5, 24, 3.2, -2, own, 0.05)
    dome = blob('rk-dome', outline(dome_pts, own), '#3e5b7f', '#22314d', (0.6, 1.6), [
        ('#587a98', body),
        ('#7699b2', upper_left),
        f'<defs><path id="rk-front" d="{front}"/></defs><use href="#rk-front" fill="#4d6e8e" transform="translate(0 3)"/><use href="#rk-front" fill="#6f92a8"/>',
        ('#7a9db3', front_lit),
        ('#8cb1c6', strip),
        ('#a8c6d6', strip_lit),
        ('#b4cee2', right_face),
        ('#dfe5ec', facet),
        ('#e8edf3', facet_lit),
        ('#a0979a', neck),
        '<ellipse cx="120" cy="61.5" rx="5.5" ry="1.6" fill="#f8fbfe" transform="rotate(-4 120 61.5)"/>'])
    cap = stack('rk-cap', [part(lump(141, 39, 26, 9.5, -15, own, 0.04), 141, 39, 26, 9.5, -15)], '#ea8890', '#f8a19d', '#7a3448', '#ffd9cf', own)
    kb = bumps(0.05, own)
    knob = f'''
  <g id="rk-knob">
    <path fill="#8a3a4c" d="{wobbly(138.5, 36.8, 8.2, 6, -15, kb, 10)}"/>
    <path fill="#f3c2bc" d="{wobbly(139.6, 36, 7.4, 5.6, -15, kb, 10)}"/>
    <ellipse cx="138" cy="33.5" rx="3.2" ry="1.4" fill="#fbe0da" transform="rotate(-15 138 33.5)"/>
  </g>'''
    eye0 = eye(0, 121, 116, 13, 12.3, -5, '#1a2a3e', '#264766',
               '<ellipse cx="122.6" cy="117.6" rx="11.4" ry="10.8" fill="#3c6788"/><ellipse cx="121.5" cy="115.5" rx="7.4" ry="7" fill="#0c121c"/>'
               '<circle cx="119" cy="113" r="1.9" fill="#cfe3ec"/><circle cx="124.5" cy="118.5" r="0.8" fill="#9fbccb"/>')
    eye1 = eye(1, 173, 106.3, 11.6, 10.4, -8, '#141e2a', '#1d2836',
               '<ellipse cx="172" cy="105" rx="6" ry="5" fill="#273647"/>'
               '<circle cx="170" cy="103" r="1.8" fill="#cfe3ec"/><circle cx="175.5" cy="108.5" r="0.8" fill="#9fbccb"/>')
    return dome + cap + knob + f'''
  <g id="rk-eyes">{eye0}{eye1}
  </g>'''
