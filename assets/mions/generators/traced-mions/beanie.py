# The beanie mion, built by hand: a purple egg under a striped pink beanie, one glinting eye, one lidded eye, a shell foot.
import random, re
import numpy as np
from common import stack, wobbly, through

rand = random.Random(41)
bumps = lambda size, r=rand: [(k, r.uniform(0.01, size) / k ** 0.5, r.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=10):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n))

def outline(points, own, j=0.6):  # a big shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-j, j), y + own.uniform(-j, j)) for x, y in points])

def part(d, cx, cy, rx, ry, tilt=0):  # a ready shape as a stack part
    return dict(d=d, cx=cx, cy=cy, rx=rx, ry=ry, tilt=tilt)

def blob(name, d, base, line, push, tones, width=1.2):
    # the dark copy under the base shows as a thin outline, thicker toward `push`; a tone is (colour, path) or ready markup
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{line}" stroke="{line}" stroke-width="{width}" stroke-linejoin="round" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join('\n      ' + (t if isinstance(t, str) else f'<path d="{t[1]}" fill="{t[0]}"/>') for t in tones) + '''
    </g>
  </g>'''

def eye(i, x, y, rx, ry, tilt, rim, hole, inner):
    # the rim, pushed down-right, shows only as a crescent there; the moving glint group must come last
    b = bumps(0.05)
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 0.9, y + 1.3, rx + 1, ry + 1, tilt, b, 10)}"/>
      <path fill="{hole}" d="{wobbly(x, y, rx, ry, tilt, b, 10)}"/>
      <g>{inner}</g>
    </g>'''

def lid(x, y, rx, ry, tilt, line):  # the lower part of an eye below `line` (its height above the centre), kept still in front of the glint
    t = np.radians(tilt); pts = []
    for a in np.radians(np.linspace(0, 180, 7)):
        u, v = (rx + 0.3) * np.cos(a), (ry + 0.3) * np.sin(a)
        pts.append((x + u * np.cos(t) - v * np.sin(t), y + u * np.sin(t) + v * np.cos(t)))
    pts = [(px, max(py, y + line)) for px, py in pts] + [(x, y + line - 0.8)]
    return through(pts, digits=1)

def extra():
    own = random.Random(42)   # the big shapes take their own stream, so they never shift when a small part changes
    body_pts = [(32, 57), (22, 64), (19, 74), (17.5, 84), (17.5, 96), (18.5, 106), (21, 113), (26, 120), (34, 125), (44, 127.5), (55, 127.5),
                (65, 125), (74, 121.5), (81, 116), (86, 109), (89, 100), (90, 90), (89, 79), (86, 68), (77, 58), (54, 54)]
    body = blob('bn-body', outline(body_pts, own), '#544268', '#2c1f3c', (0.6, 1), [
        ('#614f7b', lump(52, 92, 36, 32, 0, own, 0.04)),
        ('#6d5c88', lump(48, 84, 30, 20, -8, own, 0.05)),
        ('#7f6e9a', lump(26, 88, 7, 16, 8, own, 0.06, 8)),
        ('#75679a', lump(92, 82, 5, 15, -8, random.Random(43), 0.05, 8)),
        '<ellipse cx="23.5" cy="88" rx="1.6" ry="6" fill="#a597bd" transform="rotate(6 23.5 88)"/>'])
    # the beanie, brim to crown: each band sits in front of the one below so its crease shows as a dark line
    brim = stack('bn-brim', [part(outline([(23, 58), (31, 55), (42, 53), (54, 52.5), (66, 53), (77, 55), (83.5, 58), (85, 63), (82.5, 67.5), (76, 71.5),
                                            (66, 75), (54, 76.5), (42, 75.5), (32, 72.5), (25, 68.5), (21.5, 63)], own), 54, 65, 32, 11)],
                 '#a9505f', '#b85f6c', '#4a2236', '#c97781', own)
    band2 = stack('bn-band2', [part(outline([(31, 46), (40, 43), (53, 42), (66, 43), (74, 45), (77.5, 50), (79, 56), (76, 59.5), (66, 61.5),
                                             (53, 62.5), (40, 62), (30, 59.5), (24.5, 56), (26, 51)], own), 52, 52, 27, 10)],
                  '#d27b7e', '#df8a8b', '#8a3440', '#eaa3a3', own)
    band1 = stack('bn-band1', [part(outline([(35, 25), (45, 22), (55, 21), (66, 23), (74, 27), (76, 33), (75, 37.5), (70, 41), (60, 42.8), (50, 43.2),
                                             (40, 41.8), (33, 38.5), (31, 34), (32, 28)], own), 53, 34, 22, 11)],
                  '#d47a83', '#e0909a', '#963e46', '#eeaab0', own)
    crown = stack('bn-crown', [part(outline([(57, 12.5), (64, 15.5), (69.5, 21), (74, 27.5), (66, 30.5), (55, 31.5), (45, 30.5), (35.5, 27.5), (34.5, 24),
                                             (41, 18.5), (49, 14)], own), 54, 23, 19, 8)],
                  '#d6b7c4', '#e8cfd8', '#a8707e', '#f4e4ea', own)
    # the shell foot: a peach cap over a pink cone that narrows to a round point, with a thin dark edge on its lower right
    shell_pts = [(62, 126), (67, 121.5), (74, 120), (81, 122), (85.5, 127), (86.5, 134), (84, 142), (78, 149), (72, 153.5), (66, 156.5), (62, 154.5),
                 (59, 145), (58.5, 136), (59.5, 130)]
    cap = outline([(55, 116), (92, 116), (92, 131), (84, 132.5), (76, 134), (68, 136.5), (60, 138), (55, 138)], own)
    shell = blob('bn-shell', outline(shell_pts, own), '#9a5b5e', '#4c2c34', (0.7, 1), [
        ('#b07070', lump(66, 141, 7, 12, 10, own, 0.05, 8)),
        ('#d0916f', cap),
        ('#e0aa80', lump(77, 126, 10, 6, 10, own, 0.05, 8)),
        '<ellipse cx="69" cy="124.5" rx="3.2" ry="1.4" fill="#f6dcb8" transform="rotate(-20 69 124.5)"/>'])
    # the left eye: a dark hole with a crescent glint on its left; the right eye's lower half hides under a still brown lid
    eye0 = eye(0, 36.5, 97.5, 6.3, 8.6, 15, '#2a1d36', '#150c16',
               '<ellipse cx="37.5" cy="97.5" rx="3.6" ry="5.4" fill="#22161f" transform="rotate(15 37.5 97.5)"/>'
               '<path d="M33.6 94Q32.4 99.6 36.6 102.6" fill="none" stroke="#d6cfc6" stroke-width="1.5" stroke-linecap="round"/>')
    eye1 = eye(1, 72, 95.5, 7.2, 8.6, 28, '#2a1d36', '#1a0e12',
               '<ellipse cx="71" cy="92.5" rx="2.8" ry="1.6" fill="#cdc4c4" transform="rotate(-40 71 92.5)"/>')
    eyelid = f'''
  <path id="bn-lid" fill="#563d42" d="{lid(72, 95.5, 7.2, 8.6, 28, 1.8)}"/>
  <path id="bn-lid-lit" fill="#6c4e52" d="{lid(71.4, 95.3, 5, 6.4, 28, 2.8)}"/>'''
    return body + brim + band2 + band1 + crown + shell + f'''
  <g id="bn-eyes">{eye0}{eye1}
  </g>{eyelid}'''
