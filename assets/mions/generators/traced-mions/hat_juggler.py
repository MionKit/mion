# The hat juggler mion, built by hand: a peach body with a brown beard under a striped hat (pink brim, two grey bands, a lavender crown),
# two dark eyes, a small ear, a pale hand holding a magenta coil on the left, a pink hoop and a coiled tentacle on the right, standing on blue stones.
import random, re
import numpy as np
from common import stack, wobbly, through, shade

rand = random.Random(61)
bumps = lambda size, r=rand: [(k, r.uniform(0.01, size) / k ** 0.5, r.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=10):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n))

def small(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=10):  # a small lumpy oval, one decimal so its edge stays smooth
    return wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n)

def outline(points, own, j=0.6):  # a big shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-j, j), y + own.uniform(-j, j)) for x, y in points])

def blob(name, d, base, line, push, tones, width=1.2):
    # a flat shape over its dark copy (a thin outline, thicker toward `push`), with lighter tones clipped inside it; a tone is (colour, path) or ready markup
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{line}" stroke="{line}" stroke-width="{width}" stroke-linejoin="round" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join('\n      ' + (t if isinstance(t, str) else f'<path d="{t[1]}" fill="{t[0]}"/>') for t in tones) + '''
    </g>
  </g>'''

def eye(i, x, y, rx, ry, tilt, hole, inner):
    # a dark eye whose rim is its own shape pushed down-right, so it shows only as a crescent there; the moving iris group comes last
    b = bumps(0.05)
    return f'''
    <g id="eye-{i}">
      <path fill="#8a4643" d="{wobbly(x + 0.8, y + 1.1, rx + 0.9, ry + 0.9, tilt, b, 10)}"/>
      <path fill="{hole}" d="{wobbly(x, y, rx, ry, tilt, b, 10)}"/>
      <g>{inner}</g>
    </g>'''

def back():
    own = random.Random(62)
    # two blue boots tucked under the beard, the left one further back; they take their own stream, and the shared one skips the draws the old base used
    feet = stack('hj-feet', [(95, 181, 14, 9.5, 18, 3), (130, 187, 21, 11.5, -5, 3)], '#425f92', '#5b7fb4', '#1c2742', '#9cbce0', random.Random(64), 0.06)
    for _ in range(36): own.random()
    # the grey-blue fin poking out behind the beard on the right, its base tucked behind the beard's edge
    fin = blob('hj-fin', lump(166, 165, 14, 6, -22, own, 0.04), '#4b5d70', '#232c3a', (0.4, 1), [
        ('#6f8497', lump(164, 161, 13, 4.2, -22, own, 0.05)),
        '<ellipse cx="164" cy="160.5" rx="4" ry="1.1" fill="#a3b4c2" transform="rotate(-22 164 160.5)"/>'])
    # the magenta coil held on the left: an outer ring, then its pale inner face poking out to the right toward the hand, with the hole
    ring, ring_lit = lump(46.5, 103.5, 12, 15, -14, own, 0.04), lump(45, 99, 10, 11, -12, own, 0.05)
    face, face_lit, hole = small(56, 107, 9.4, 11, -14, own), small(54.5, 104, 6.4, 7.4, -14, own), small(58.5, 109, 4, 6.6, -14, own)
    coil = blob('hj-coil', ring, '#7a395a', '#45182f', (0.5, 1), [
        ('#8f4569', ring_lit),
        ('#cc77a0', small(52, 91, 5, 3, -10, own)),
        '<ellipse cx="50" cy="89.8" rx="2" ry=".8" fill="#eab4cc" transform="rotate(-10 50 89.8)"/>'])
    coil += blob('hj-coil-face', face, '#c08f9e', '#5a2440', (0.4, 0.9), [('#d7b0ba', face_lit), ('#8a5470', hole)], 0.8)
    return feet + fin + coil

def extra():
    own = random.Random(63)   # the big shapes take their own stream, so they never shift when a small part changes
    body_pts = [(88, 66), (83, 78), (81, 92), (82, 105), (83, 117), (85, 129), (89, 140), (95, 150), (98, 161), (104, 169), (113, 174.5), (127, 177.5),
                (141, 176.5), (153, 171.5), (161, 163), (166, 155), (169.5, 143), (171, 129), (171.5, 114), (171, 100), (169, 88), (164, 77), (156, 67),
                (145, 59), (128, 54), (108, 57)]
    body = blob('hj-body', outline(body_pts, own), '#cc7d72', '#4e2a2e', (0.6, 1), [
        ('#e4a59b', outline([(70, 40), (180, 40), (178, 72), (166, 78), (154, 86), (140, 93), (121, 99.5), (101, 103), (78, 104.5)], own)),
        ('#efb6aa', lump(110, 86, 20, 6, -18, own, 0.05)),
        ('#d98b7f', lump(160, 104, 6, 14, 0, own, 0.05, 8)),
        ('#b9696a', lump(96, 141, 10, 6, 25, own, 0.05, 8)),
        ('#4b3436', outline([(76, 136), (90, 140), (101, 146.5), (115, 149.5), (130, 148.5), (145, 144.5), (159, 137.5), (170, 129), (180, 125), (180, 190), (76, 190)], own)),
        ('#5a3f40', lump(118, 158, 16, 6, -6, own, 0.05)),
        '<ellipse cx="93" cy="84" rx="5" ry="1.6" fill="#f6cbbf" transform="rotate(-20 93 84)"/>'])
    ear = blob('hj-ear', small(165.5, 76.5, 4.6, 10.5, -25, own, 0.04), '#e48f8a', '#8e4a49', (-1.1, 0.6), [
        ('#f2aaa4', small(164.6, 74, 2.8, 7, -25, own))])
    tooth = f'\n  <path id="hj-tooth" fill="#e8a8b4" d="{through([(92.5, 146), (100.5, 145.5), (99.5, 151.5), (97.6, 157.5), (95.4, 152)], digits=1)}"/>'
    # the hat: brim, lower grey band, upper grey band, lavender crown; each one's dark copy below it shows as the line between stripes
    brim = blob('hj-brim', outline([(79, 70), (90, 69), (105, 67), (118, 62), (130, 56), (139, 52), (146, 55), (150, 61), (147, 67), (139, 73.5), (127, 80.5),
                                    (114, 85.5), (100, 88.5), (88, 90), (80, 89), (77.5, 80)], own), '#e38385', '#6e2a2c', (0.4, 1.4), [
        ('#bb5450', outline([(70, 85), (86, 86.5), (100, 84.5), (113, 81.5), (126, 76.5), (138, 69.5), (146, 61), (160, 60), (160, 100), (70, 100)], own)),
        ('#ec9b9b', lump(96, 75, 14, 3.5, -12, own, 0.05)),
        '<ellipse cx="88" cy="75.5" rx="4" ry="1.3" fill="#f7c4c0" transform="rotate(-8 88 75.5)"/>'])
    band_b = blob('hj-band-b', outline([(79, 56), (85, 50), (100, 48), (115, 44), (128, 40), (134, 42), (137, 48), (136, 54), (130, 58.5), (120, 63),
                                        (108, 66.5), (95, 68.5), (84, 68.5), (79, 65)], own), '#9f98a7', '#4a3846', (0.3, 1.4), [
        ('#aea8b5', lump(98, 60, 15, 4, -14, own, 0.05)),
        ('#8e8698', outline([(70, 67), (95, 66), (112, 63), (126, 57), (136, 49), (150, 50), (150, 80), (70, 80)], own))])
    band_a = blob('hj-band-a', outline([(79, 40), (86, 36), (98, 34), (110, 28), (120, 23), (126, 26), (129, 33), (127, 40), (120, 46), (110, 50),
                                        (100, 52), (90, 52), (81, 50), (78, 45)], own), '#c4aeb4', '#4f3a4a', (0.3, 1.5), [
        ('#d4c2c6', lump(96, 43, 12, 3.5, -12, own, 0.05)),
        ('#b29ea8', outline([(118, 52), (124, 42), (127, 32), (135, 30), (135, 52)], own))])
    crown = blob('hj-crown', outline([(79, 34), (80, 26), (85, 20), (93, 16.5), (102, 15.5), (110, 18), (115, 22), (118, 28), (116, 34), (110, 38),
                                      (100, 41), (90, 41), (82, 39)], own), '#c8a8d6', '#4f3a4a', (0.3, 1.5), [
        ('#a493cc', lump(113, 28, 6, 9, 10, own, 0.06, 8)),
        ('#d9b9e4', lump(95, 26, 13, 9, -10, own, 0.05)),
        ('#ecd6f2', small(99, 21.5, 6, 3, -12, own)),
        '<ellipse cx="96" cy="20.5" rx="3" ry="1.1" fill="#fbf0fd" transform="rotate(-14 96 20.5)"/>'])
    # the left arm: two pink knuckles from the beard up to the pale hand gripping the coil
    arm = stack('hj-arm', [(85, 148, 5.4, 7.4, -12), (78.5, 134.5, 6.4, 5.8, -20)], '#cf6c78', '#e18c96', '#5e2232', '#f2b8be', own, 0.05)
    hand = stack('hj-hand', [(73, 117, 6.8, 9.6, -22)], '#e7aab0', '#f6cdd0', '#7a3c48', '#fff1f2', own)
    # the right side: a pink hoop over the body edge, a tentacle reaching out from it and a coil of loops going up
    hoop = blob('hj-hoop', small(173.5, 139, 7.4, 13.6, 10, own, 0.04), '#c27088', '#4e2236', (0.5, 1), [
        ('#e1a2b8', small(172, 134, 4.4, 7.5, 10, own)),
        f'<path d="{small(174.8, 140.5, 4.2, 9.6, 10, own)}" fill="#4c2840"/>',
        f'<path d="{small(176, 143, 2.6, 6.4, 10, own)}" fill="#7a4058"/>'])
    reach = blob('hj-reach', through([(177.5, 141), (181, 138.6), (188, 135.4), (194, 130.6), (198.6, 127.8), (201.4, 130.6), (198.2, 134.2), (191, 139.6),
                                       (184, 143.8), (179, 146.6)], digits=1), '#c66f8e', '#4e1c32', (0.3, 0.8), [
        ('#e6a2be', through([(178, 140), (188, 134), (198, 126), (200, 129), (189, 137.4), (179, 143)], digits=1))], 0.8)
    # the coil: one lobe shape drawn once and placed six times, bottom up, alternating its tilt so the loops read as one twisted spring
    lobe, lit = small(0, 0, 7.4, 4, 0, own), small(-1.4, -1, 4.8, 2.2, 0, own)
    loops = f'''
  <g id="hj-loops">
    <defs><path id="hj-lobe" d="{lobe}"/><path id="hj-lobe-lit" d="{lit}"/></defs>'''
    for i, (x, y, size, tilt) in enumerate([(203, 136, 0.8, 22), (207, 128, 1, -26), (201, 120, 1, 24), (207, 111.5, 1, -24), (201, 103.5, 0.97, 20), (204.5, 95.5, 1.1, -8)]):
        tint = own.uniform(-0.08, 0.08)
        loops += f'''
    <g transform="translate({x} {y}) rotate({tilt}) scale({size})"><use href="#hj-lobe" fill="#8a3656" transform="translate(0.6 1.6)"/><use href="#hj-lobe" fill="{shade('#c86f8c', tint)}"/><use href="#hj-lobe-lit" fill="{shade('#e7a2b8', tint)}"/></g>'''
    loops += '''
    <ellipse cx="200.5" cy="94" rx="3" ry="1" fill="#fbe0ea" transform="rotate(-8 200.5 94)"/>
  </g>'''
    eye0 = eye(0, 101, 128.5, 5.4, 6.5, -12, '#2c2a31',
               '<ellipse cx="100.6" cy="128.6" rx="3" ry="4.4" fill="#57535b" transform="rotate(-12 100.6 128.6)"/>'
               '<ellipse cx="99.8" cy="127.4" rx=".9" ry="2.3" fill="#a59fa2" transform="rotate(-12 99.8 127.4)"/>')
    eye1 = eye(1, 156.5, 112.6, 5.9, 6.4, 8, '#2d2b2d',
               '<ellipse cx="156.6" cy="113.2" rx="3.9" ry="4.4" fill="#464b47" transform="rotate(8 156.6 113.2)"/>'
               '<ellipse cx="155" cy="110.4" rx="1.4" ry="1" fill="#848a84" transform="rotate(-30 155 110.4)"/>')
    return body + ear + tooth + brim + band_b + band_a + crown + arm + hand + hoop + reach + loops + f'''
  <g id="hj-eyes">{eye0}{eye1}
  </g>'''
