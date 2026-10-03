# The plant mion, built by hand: a white fin-shaped body with a blue belly, palm fronds stacked from reused leaf pieces, a yellow fruit, a ringed orange antenna and one big eye.
import random, re
import numpy as np
from common import stack, cone, wobbly, through, shade

rand = random.Random(29)
bumps = lambda size, own=rand: [(k, own.uniform(0.01, size) / k ** 0.5, own.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=12, box=2):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n, box))

def uneven(points, own):  # a big shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-1, 1), y + own.uniform(-1, 1)) for x, y in points])

def part(d, cx, cy, rx, ry, tilt=0):  # a ready shape as a stack part
    return dict(d=d, cx=cx, cy=cy, rx=rx, ry=ry, tilt=tilt)

LEAF_L, LEAF_W, LEAF_BEND = 100, 10, 7   # the one leaf is drawn 100 long and 20 wide, base at the origin pointing right, its tip drooping 7 down

def leaf_defs():
    # one long slender leaf with a few small notches, a darker underside and a light midrib, reused by every frond
    own = random.Random(291)
    mid = lambda u: LEAF_BEND * u * u
    us = np.linspace(0.06, 0.94, 12)
    half = [LEAF_W * (1 - u) ** 0.6 * u ** 0.4 / 0.51 for u in us]   # widest before the middle, a slender run to a round tip
    dips = lambda: set(own.sample(range(3, 11), 2))
    top_dips, low_dips = dips(), dips()
    top = [(u * LEAF_L, mid(u) - h * (0.88 if i in top_dips else 1)) for i, (u, h) in enumerate(zip(us, half))]
    low = [(u * LEAF_L, mid(u) + h * (0.88 if i in low_dips else 1)) for i, (u, h) in enumerate(zip(us, half))]
    leaf = [(0, 0)] + top + [(LEAF_L, mid(1))] + low[::-1]
    under = [(u * LEAF_L, mid(u) + 1) for u in us] + [(LEAF_L, mid(1))] + low[::-1]
    rib = [(u * LEAF_L, mid(u) - 1.2 * np.sin(np.pi * u)) for u in np.linspace(0.08, 0.85, 6)] + [(u * LEAF_L, mid(u) - 0.3) for u in np.linspace(0.85, 0.08, 6)]
    return f'''
  <defs>
    <g id="pm-leaf"><path d="{through(leaf, digits=1)}"/><path d="{through(under, digits=1)}" fill="#1c2b22" opacity="0.2"/><path d="{through(rib, digits=1)}" fill="#fff" opacity="0.3"/></g>
  </defs>'''

def frond(name, base, tip, width, color, vary=0.06, own=rand):
    # one leaf from base to tip, scaled to the frond's width; the droop falls to the underside whichever way the frond points
    b, t = np.array(base, float), np.array(tip, float)
    d = t - b; length = np.hypot(*d)
    flip = -1 if d[0] < 0 else 1
    sy = width / (2 * LEAF_W); sx = np.sqrt(max(1, length ** 2 - (LEAF_BEND * sy) ** 2)) / LEAF_L
    ang = np.degrees(np.arctan2(d[1], d[0]) - np.arctan2(flip * LEAF_BEND * sy, LEAF_L * sx))
    fill = shade(color, own.uniform(-vary, vary))
    return f'\n  <use id="{name}" href="#pm-leaf" fill="{fill}" transform="translate({b[0]:.1f} {b[1]:.1f}) rotate({ang:.1f}) scale({sx:.3f} {flip * sy:.3f})"/>'

def back():
    leaves = random.Random(294)   # the fronds take their own stream
    own = random.Random(292)
    for _ in range(18): own.random()   # the draws the old stacked fronds took, so the cap, fruit, antenna and legs keep their shapes
    UP, LO = '#adc196', '#90aa8b'
    root = (82, 114)   # the upper fan grows from one point hidden behind the fruit and its cap
    upper = (frond('pm-frond-thin', root, (37, 40), 14, '#8aa583', own=leaves)
             + frond('pm-frond-top', root, (70, 12), 22, UP, own=leaves)
             + frond('pm-frond-left', root, (2, 55), 22, LO, own=leaves)
             + frond('pm-frond-right', root, (97, 35), 22, '#a6b58f', own=leaves)
             + frond('pm-frond-low', root, (29, 97), 16, '#839b82', own=leaves))
    low = (74, 167)
    lower_back = (frond('pm-frond-b', low, (20, 150), 8, '#5f7a5d', own=leaves)
                  + frond('pm-frond-c', low, (34, 159), 8, '#53635a', own=leaves)
                  + frond('pm-frond-e', low, (47, 198), 10, '#6c8873', own=leaves)
                  + frond('pm-frond-d', low, (0, 181), 17, '#89a688', own=leaves))
    small = lambda cx, cy, rx, ry, tilt=0, box=2: part(lump(cx, cy, rx, ry, tilt, own, 0.06, 10, box), cx, cy, rx, ry, tilt)
    cap = (stack('pm-cap', [part(lump(95, 122, 18, 17, -15, own, 0.12, 12), 95, 122, 18, 17, -15)], '#7f8c4a', '#9dad63', '#46512f', '#cfd99b', own)
           + frond('pm-tuft', (92, 117), (101, 101), 8, '#a6b56c', own=leaves))
    for _ in range(2): own.random()
    fruit = stack('pm-fruit', [small(71, 136, 20, 27, -6, 2.1)], '#c4a663', '#dfbf79', '#4a4535', '#f3dca0', own)
    near = frond('pm-frond-a', (76, 166), (0, 123), 15, '#879d86', own=leaves)
    for _ in range(2): own.random()
    # rings tight at the base, tilting more toward the bottom so the antenna bends left into the body; the long top piece leans a little left
    # rings from the body up, each a little narrower than the one above, under a long top that leans a little left
    antenna = stack('pm-antenna', [small(120, 119, 14, 9, -34, 2.6), small(125, 110, 15.5, 9, -24, 2.6), small(130, 101, 17, 9, -14, 2.6), small(133, 70, 18, 33, -8, 2.4)],
                    '#d56567', '#ec8a80', '#9a4450', '#ffcfc2', own, vary=0.05)
    antenna += f'\n  <g clip-path="url(#pm-antenna-3-clip)"><path d="{lump(136, 61, 13, 24, -8, own, 0.05, 10)}" fill="#fa9e92"/></g>'
    legs = leg('pm-leg-left', 61, 218, 12, 16, 47, 63, '#aaa8cb', '#c9c8e2', '#55557e') + leg('pm-leg-right', 120, 239, 24, 15, 36, -34, '#b8bcdb', '#e6e8f3', '#5c618c')
    return leaf_defs() + upper + lower_back + cap + fruit + near + antenna + legs

def leg(name, x, y, top, bottom, h, tilt, base, light, line):  # one cone, splayed by tilt, round at the ground end, a slimmer lit cone along it
    own = random.Random(name)
    shape = cone(x, y, top, bottom, h, tilt, own, 0.45)['d']
    t = np.radians(tilt)
    lit = cone(x - 1.5 * np.cos(t), y - 1.5 * np.sin(t), top * 0.5, bottom * 0.55, h - 7, tilt, None, 0.45)['d']
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{shape}"/></defs>
    <use href="#{name}-shape" fill="{line}" transform="translate(0.8 1.4)"/>
    <use href="#{name}-shape" fill="{base}"/>
    <path d="{lit}" fill="{light}"/>
  </g>'''

def eye(i, x, y, rx, ry, tilt, rim, white, pupil):
    # the rim is the white's own shape pushed down-right, so it shows as a crescent there and the upper left has no border
    b = bumps(0.04)
    px, py, pr = pupil
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1.8, y + 2.2, rx + 2, ry + 2, tilt, b, 12)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, tilt, b, 12)}"/>
      <g><path fill="#1e2027" d="{wobbly(px, py, pr, pr * 0.96, 0, bumps(0.03), n=10)}"/><circle cx="{px - pr * 0.38:.1f}" cy="{py - pr * 0.42:.1f}" r="{pr * 0.24:.1f}" fill="#fff"/></g>
    </g>'''

def socket(x, y, rx, ry):  # a pale grey band inside the white's lower left, kept still in front of the pupil
    a = np.radians(np.linspace(70, 200, 5))
    pts = [(x + (rx - 2.6) * np.cos(v), y + (ry - 2.6) * np.sin(v)) for v in a]
    return f'''
  <path id="pm-socket" d="{through(pts, closed=False, digits=1)}" fill="none" stroke="#c4c8d6" stroke-width="3" stroke-linecap="round" opacity="0.85"/>'''

def extra():
    own = random.Random(293)   # the silhouette and its tones take their own stream
    body_pts = [(71, 170), (76, 158), (88, 146), (104, 135), (124, 123), (145, 112), (165, 102), (181, 95), (189, 93), (192, 96), (186, 103),
                (176, 110), (171, 117), (175, 126), (185, 139), (194, 155), (200, 172), (202, 190), (199, 204), (192, 214), (180, 222),
                (162, 228), (143, 229), (128, 227), (113, 228), (99, 223), (88, 214), (78, 206), (72, 194), (70, 182)]
    blue = [(104, 192), (110, 181), (122, 175), (138, 179), (156, 186), (172, 184), (188, 178), (206, 170), (214, 245), (130, 245), (119, 224), (109, 209)]
    deep = [(110, 207), (126, 216), (150, 220), (176, 214), (196, 202), (212, 245), (128, 245), (117, 222)]
    white = [(66, 238), (113, 232), (106, 213), (100, 196), (104, 182), (114, 166), (132, 150), (155, 134), (175, 117), (198, 99), (196, 80), (62, 150)]
    tones = [('#cdced7', lump(150, 150, 42, 36, -30, own, 0.05)), ('#a8adbc', lump(206, 160, 12, 42, -8, own, 0.05)),
             ('#f3f3f4', uneven(white, own)), ('#a3a1ba', lump(67, 197, 7, 24, 8, own, 0.06)),
             ('#56648f', uneven(blue, own)), ('#434d77', uneven(deep, own))]
    body = f'''
  <g id="pm-body">
    <defs><path id="pm-body-shape" d="{uneven(body_pts, own)}"/><clipPath id="pm-body-clip"><use href="#pm-body-shape"/></clipPath></defs>
    <use href="#pm-body-shape" fill="#3a4369" transform="translate(0.8 1.4)"/>
    <use href="#pm-body-shape" fill="#b5b9c6"/>
    <g clip-path="url(#pm-body-clip)">''' + ''.join(f'\n      <path d="{d}" fill="{c}"/>' for c, d in tones) + '''
      <ellipse cx="118" cy="131" rx="24" ry="3" fill="#ffffff" transform="rotate(-30 118 131)"/>
    </g>
  </g>'''
    bump = f'''
  <g id="pm-bump">
    <path fill="#a9adbb" d="{wobbly(158.5, 166, 7, 4.5, -10, bumps(0.05, own), n=8)}"/>
    <path fill="#e2e4ea" d="{wobbly(156.5, 164.5, 5.5, 3.6, -10, bumps(0.05, own), n=8)}"/>
  </g>
  <g id="pm-cheek">
    <path fill="#2c3760" d="{wobbly(178, 214, 5, 4, 0, bumps(0.06, own), n=8)}"/>
    <path fill="#e6dde4" d="{wobbly(184, 212, 4, 5, 10, bumps(0.06, own), n=8)}"/>
    <ellipse cx="184.5" cy="214" rx="1.3" ry="1.8" fill="#c48d9b"/>
  </g>'''
    return body + bump + f'''
  <g id="pm-eyes">{eye(0, 136, 193, 19.5, 20, 0, '#323b5a', '#f3f4f6', (135.5, 189.5, 10.5))}
  </g>{socket(136, 193, 19.5, 20)}'''
