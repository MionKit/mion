# The grub mion, built by hand: a pink body of segments curling down from a big round head to a grey tip, thin creases between them, spiral creases on the head and two small eyes.
import random, re
import numpy as np
from common import wobbly, through

rand = random.Random(41)
bumps = lambda size, own=rand: [(k, own.uniform(0.01, size) / k ** 0.5, own.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=10):  # a lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n))

def uneven(points, own, digits=0):  # a shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-0.6, 0.6), y + own.uniform(-0.6, 0.6)) for x, y in points], digits=digits)

def taper(p0, p1, p2, top, bottom):  # a quadratic crease line drawn as a filled taper, round at both ends
    p0, p1, p2 = (np.array(p, float) for p in (p0, p1, p2))
    ts = np.linspace(0, 1, 4)
    mid = [(1 - t) ** 2 * p0 + 2 * t * (1 - t) * p1 + t * t * p2 for t in ts]
    tan = [2 * (1 - t) * (p1 - p0) + 2 * t * (p2 - p1) for t in ts]
    side = [np.array([-d[1], d[0]]) / np.hypot(*d) for d in tan]
    half = [top + (bottom - top) * t for t in ts]
    left = [m + s * w / 2 for m, s, w in zip(mid, side, half)]
    right = [m - s * w / 2 for m, s, w in zip(mid, side, half)]
    def cap(m, d, s, w):  # a round end: a half circle from one side to the other
        d = d / np.hypot(*d)
        return [m + (s * np.cos(a) + d * np.sin(a)) * w / 2 for a in np.radians((50, 90, 130))]
    return through(left + cap(mid[-1], tan[-1], side[-1], half[-1]) + right[::-1] + cap(mid[0], -tan[0], -side[0], half[0]), digits=1)

def piece(name, d, base, crease, push, tones):
    # one segment: its dark copy pushed toward the segment below shows as the crease, then the flat base and lighter tones clipped inside
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{crease}" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join(f'\n      <path d="{t}" fill="{c}"/>' for c, t in tones) + '''
    </g>
  </g>'''

LINE = '#6b4658'   # creases and outline

def eye(i, x, y, r, p):
    # the rim is the white's own shape pushed down-right, so it shows as a crescent there and the upper left has no border
    b = bumps(0.08)
    return f'''
    <g id="eye-{i}">
      <path fill="#7d4a5e" d="{wobbly(x + 0.7, y + 0.9, r + 1.1, r + 1.1, -10, b, 10)}"/>
      <path fill="#f6f4f1" d="{wobbly(x, y, r, r, -10, b, 10)}"/>
      <g><circle cx="{x + 0.5}" cy="{y + 0.5}" r="{p}" fill="#1d1f2b"/><circle cx="{x - p * 0.3:.1f}" cy="{y - p * 0.35:.1f}" r="{max(1.1, p * 0.3):.1f}" fill="#fff"/></g>
    </g>'''

def extra():
    own = random.Random(411)   # the silhouette and segments take their own stream
    # the whole grub as one outline, measured on the reference: head top, its round right side, the body curling down to the tip and back up the left
    body = uneven([(64, 28.5), (72, 27.8), (80, 29.5), (87, 32.5), (92, 37), (95.5, 43), (97, 50), (96, 56), (93.5, 61), (88, 66), (81, 70.5),
                   (74, 75), (68.5, 79), (65.5, 84), (63.3, 90), (62.3, 96), (63, 101.5), (65.5, 105.5), (67.3, 110), (66.5, 114), (63, 117.5),
                   (58, 119), (53.5, 117.5), (50, 113.5), (47.5, 108.5), (45, 102), (42.7, 95), (41.3, 87), (41.2, 78), (41.2, 68), (41.7, 60),
                   (43.5, 56), (45.3, 53), (45.2, 47), (46.5, 42), (49, 37.5), (53, 33), (58, 30)], own)
    # segments from the tip up; each one's outer side runs past the outline, which clips it
    tip = piece('gb-tip', lump(59.5, 114, 11, 7.5, -35, own, 0.04), '#857c80', LINE, (0, 0), [
        ('#a29b9b', lump(60, 115, 7, 4.8, -30, own, 0.05, 8))])
    seg4 = piece('gb-seg4', uneven([(38, 92), (50, 90), (66, 91), (70, 98), (65.5, 102.5), (62, 105.5), (58, 108), (54, 110.3), (50, 112.5), (44, 114), (39, 104)], own),
                 '#9c7477', LINE, (0.3, 1.6), [('#b48b8b', lump(49, 99, 9, 9, -15, own, 0.05))])
    seg3 = piece('gb-seg3', uneven([(37, 74), (50, 73), (68, 74), (69, 84), (66, 92.2), (58, 92.8), (50, 92.4), (42, 91), (37, 90)], own),
                 '#a2747c', LINE, (0, 1.6), [('#bb8c94', lump(48, 82, 10, 9, 0, own, 0.05))])
    seg2 = piece('gb-seg2', uneven([(37, 56), (46, 54), (60, 58), (74, 62), (72, 72), (67, 77), (61, 76.4), (51, 75), (41, 73), (37, 72)], own),
                 '#a87a83', LINE, (0, 1.6), [('#c4979e', lump(49, 64, 11, 9, 0, own, 0.05)), ('#d9b0b4', lump(44, 63, 4, 6, 0, own, 0.06, 8))])
    head = piece('gb-head', uneven([(42, 52.5), (41, 45), (44, 37), (49, 31), (56, 26), (64, 24), (74, 24), (84, 26), (92, 31), (97, 37), (100, 45),
                                    (100, 54), (97, 62), (91, 68), (83, 73), (75, 78), (70, 79), (69, 74), (70.5, 69), (72.5, 63.5), (67, 61.3),
                                    (61, 60.5), (55, 59), (50, 56.5)], own), '#a17a8e', LINE, (-1, 1.6), [
        ('#c296a5', lump(70, 46, 28, 21, 15, own, 0.04)),
        ('#dcb4c0', lump(66, 40, 23, 15, 10, own, 0.05)),
        ('#ecccd7', lump(57, 39, 12, 14, 20, own, 0.06)),
        ('#fbf3f7', lump(51.5, 41, 7, 12.5, 25, own, 0.06, 8))])
    lines = (taper((58.5, 36), (59, 48.5), (80, 53.5), 2.6, 1.2)      # the spiral crease, a dark hook at its start
             + taper((74, 31.5), (80, 44), (93, 52), 1, 1.6)
             + taper((79, 55.5), (75.5, 59), (72, 64), 3, 1.6))      # the short dark crease where the head turns under
    return f'''
  <g id="gb-whole">
  <defs><path id="gb-body-shape" d="{body}"/><clipPath id="gb-body-clip"><use href="#gb-body-shape"/></clipPath></defs>
  <use href="#gb-body-shape" fill="{LINE}" stroke="{LINE}" stroke-width="1.8" stroke-linejoin="round" transform="translate(0.4 0.6)"/>
  <g clip-path="url(#gb-body-clip)">{tip}{seg4}{seg3}{seg2}{head}
  <path id="gb-creases" fill="{LINE}" d="{lines}"/>
  <ellipse cx="42.8" cy="72.5" rx="1.6" ry="2.2" fill="#f2e2e6"/>
  </g>
  </g>
  <g id="gb-eyes">{eye(0, 67, 39, 4.6, 2.6)}{eye(1, 77, 46, 4, 2.3)}
  </g>'''
