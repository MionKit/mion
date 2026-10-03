# The teal hood mion, built by hand: a teal hood with a face plate, a ringed socket round its big eye, a snout, legs, a fang.
import random, re
from common import cone, wobbly, through

rand = random.Random(21)
bumps = lambda size, r=rand: [(k, r.uniform(0.01, size) / k ** 0.5, r.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=10, box=2):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n, box))

def outline(points, own):  # a big shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-0.8, 0.8), y + own.uniform(-0.8, 0.8)) for x, y in points])

def blob(name, d, base, crease, under, tones, shine=''):
    # a flat shape over its own darker copy moved by `under`, with lighter lumpy tones and a shine clipped inside it
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{crease}" transform="{under}"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join(f'\n    <path d="{t}" fill="{c}"/>' for c, t in tones) + shine + '''
    </g>
  </g>'''

def grow(cx, cy, k, dx=0, dy=0):  # a transform that scales a shape about its centre and nudges it, for an outline all round
    return f'translate({cx + dx} {cy + dy}) scale({k}) translate({-cx} {-cy})'

def leg(name, x, y, top, bottom, h, tilt, base, light, crease):  # one cone, wide where it tucks under the body, with a slimmer lit cone inside
    shape = cone(x, y, top, bottom, h, tilt, rand)['d']
    lit = cone(x - 1.5, y - 2, top * 0.5, bottom * 0.55, h - 6, tilt)['d']
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{shape}"/></defs>
    <use href="#{name}-shape" fill="{crease}" transform="translate(0.8 1.2)"/>
    <use href="#{name}-shape" fill="{base}"/>
    <path d="{lit}" fill="{light}"/>
  </g>'''

def back():  # a dark wedge in the body's shadow, the thin far leg, the two near legs and the fang, all tucked under the body
    under = outline([(56, 144), (112, 144), (110, 160), (100, 170), (84, 172), (68, 173), (60, 164)], random.Random(22))
    far = leg('th-leg-far', 87, 166, 6.5, 3.5, 38, -5, '#574a5a', '#6a5c6e', '#2c2026')
    left = leg('th-leg-left', 58.5, 165, 15, 5.5, 40, -8, '#6266a0', '#787cb4', '#352f4a')
    right = leg('th-leg-right', 99, 161, 18, 8, 32, 8, '#525f84', '#65729a', '#2d3048')
    fang = f'''
  <g id="th-fang">
    <path fill="#4b3c3c" d="{through([(110, 157.5), (117, 151), (125, 146.5), (130, 147), (128, 152), (120, 159), (113, 161)])}"/>
    <path fill="#e9ece6" d="{through([(110, 156), (116, 149), (124, 144.5), (129.5, 145), (128, 150), (120, 157), (113, 159.5)], digits=1)}"/>
    <path fill="#fbfdf8" d="{through([(115, 151), (122, 146.5), (128, 146), (124, 150), (117, 154)])}"/>
  </g>'''
    return f'''
  <path id="th-under" fill="#36262b" d="{under}"/>{far}{left}{right}{fang}'''

def eye(i, x, y, rx, ry, tilt, rim, white, pupil, push=(1.3, 1.8), n=8):
    # the rim is the white pushed down-right, so it shows only as a lower-right crescent
    b = bumps(0.04)
    px, py, prx, pry, col = pupil
    shape = (lambda *a: whole(wobbly(*a))) if rx > 12 else wobbly   # a big white keeps its curve in whole pixels
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{shape(x + push[0], y + push[1], rx + 1.6, ry + 1.6, tilt, b, n)}"/>
      <path fill="{white}" d="{shape(x, y, rx, ry, tilt, b, n)}"/>
      <g><ellipse cx="{px}" cy="{py}" rx="{prx}" ry="{pry}" fill="{col}" transform="rotate({tilt} {px} {py})"/><circle cx="{px - prx * 0.35:.1f}" cy="{py - pry * 0.42:.1f}" r="{max(1, prx * 0.26):.1f}" fill="#fff"/></g>
    </g>'''

def extra():
    own = random.Random(211)   # the big shapes take their own stream, so they never shift when a small part changes
    body_pts = [(71, 28), (57, 32), (45, 43), (35, 58), (28, 75), (27, 92), (23, 108), (23, 125), (33, 136), (48, 143), (64, 148), (86, 149),
                (106, 146), (118, 134), (120, 112), (115, 86), (112, 64), (104, 47), (91, 32)]
    # the darker band under the strap, its soft lower edge sweeping from the left side to the snout
    band = outline([(38, 56), (48, 66), (63, 76), (77, 86), (92, 93), (96, 112), (84, 115), (68, 111), (54, 105), (45, 96), (40, 82)], own)
    body = blob('th-body', outline(body_pts, own), '#4b8a9b', '#24505e', grow(72, 90, 1.02, 0.4, 1.4), [
        ('#5ea3af', lump(66, 86, 44, 54, 8, own, 0.04, 8)),
        ('#67b5c1', lump(34, 104, 12, 34, 10, own, 0.06, 8))],
        f'\n    <defs><path id="th-band" d="{band}"/></defs><use href="#th-band" fill="#4b8592" transform="translate(0.6 2)"/><use href="#th-band" fill="#5899a5"/>'
        '\n    <ellipse cx="32" cy="124" rx="5.5" ry="2.8" fill="#effcfa" transform="rotate(28 32 124)"/>')
    # the face plate: the hood's top, down to the dark strap that runs from the small eye to the snout
    hood_pts = [(71, 28), (57, 32), (45, 43), (39, 53), (44, 62), (54, 70), (66, 78), (77, 86), (88, 91), (102, 89), (112, 76), (112, 62),
                (104, 47), (91, 32)]
    hood = blob('th-hood', outline(hood_pts, own), '#64b3c0', '#1d4855', 'translate(-0.8 2.4)', [
        ('#6fc4d0', lump(70, 56, 30, 24, -20, own, 0.05, 8)),
        ('#9cdeea', lump(72, 37, 17, 8, -20, own, 0.06, 8))],
        '\n    <ellipse cx="66" cy="32.5" rx="5" ry="1.8" fill="#e6fbfc" transform="rotate(-15 66 32.5)"/>')
    ring_d = lump(89, 65, 25, 23, -20, own, 0.03)
    ring = blob('th-ring', ring_d, '#62b4c4', '#1b4553', grow(89, 65, 1.07, 0.6, 1), [
        ('#72c6d3', lump(87, 61, 21, 18, -20, own, 0.04, 8)),
        ], '\n    <ellipse cx="80" cy="52" rx="12" ry="5" fill="#93d6e2" transform="rotate(-30 80 52)"/>')
    # the snout: a dark side showing on the left, the round lit face on the right with its own dark edge
    side_d, rim_lit, face_d = lump(111.5, 114.5, 25.5, 27, -10, own, 0.03), lump(108, 108, 20, 22, -10, own, 0.04, 8), lump(117, 114, 19.5, 25, -10, own, 0.03)
    snout = blob('th-snout', side_d, '#4f8c98', '#1a4049', grow(111.5, 114.5, 1.05, -1, 1.6), [('#5ea6ae', rim_lit)],
        f'\n    <defs><path id="th-snout-face" d="{face_d}"/></defs><use href="#th-snout-face" fill="#1f4a55" transform="translate(-1.6 0.6)"/><use href="#th-snout-face" fill="#75bfc8"/>'
        f'\n    <path d="{lump(114, 109, 17, 21, -10, own, 0.04, 8)}" fill="#86d3d7"/>\n    <ellipse cx="110" cy="99" rx="8" ry="5" fill="#8ddde2" transform="rotate(-30 110 99)"/>')
    brow = '\n  <ellipse id="th-brow" cx="64.5" cy="37.5" rx="3.2" ry="1.4" fill="#2a5260" transform="rotate(45 64.5 37.5)"/>'
    return body + hood + ring + snout + brow + f'''
  <g id="th-eyes">{eye(0, 92, 62.5, 17, 14, -15, '#24566a', '#b8e6f4', (95, 62.5, 8.6, 8, '#433848'), n=10)}{eye(1, 125.5, 119.5, 6.4, 7.2, -15, '#24505c', '#bfe2e7', (126, 120, 4.8, 5.4, '#24333b'))}{eye(2, 52.5, 44.5, 12, 6, -38, '#1d5464', '#e4fbfd', (55, 46.5, 4.4, 3.6, '#4a545c'), (-0.6, 2))}
  </g>'''
