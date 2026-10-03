# The fin-fish mion, built by hand: a pointed white hood over a one-eyed grey face, a nub, three legs, a ringed antenna, red fins.
import random, re
import numpy as np
from common import stack, cone, wobbly, through, shade

rand = random.Random(41)
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

def blob(name, d, base, crease, push, tones, shine=''):
    # a flat shape over its own darker copy pushed by `push`, with lighter lumpy tones and a shine clipped inside it
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{crease}" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join(f'\n      <path d="{t}" fill="{c}"/>' for c, t in tones) + shine + '''
    </g>
  </g>'''

def leg(name, x, y, top, bottom, h, tilt, base, light, line):  # one cone, splayed by tilt, round at the ground end, a slimmer lit cone along it
    own = random.Random(name)
    shape = cone(x, y, top, bottom, h, tilt, own, 0.45)['d']
    lit = cone(x - 1.5, y - 2, top * 0.5, bottom * 0.5, h - 8, tilt, None, 0.45)['d']
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{shape}"/></defs>
    <use href="#{name}-shape" fill="{line}" transform="translate(0.8 1.4)"/>
    <use href="#{name}-shape" fill="{base}"/>
    <path d="{lit}" fill="{light}"/>
  </g>'''

def flat(name, parts, base, light, crease, own, vary=0, first=(0, 2.5)):
    # cheap stacked pieces: no clip and no shine, a darker copy toward the piece before and a smaller lighter copy up-left
    out = f'\n  <g id="{name}">'
    for i, (cx, cy, rx, ry, tilt, *box) in enumerate(parts):
        d = wobbly(cx, cy, rx, ry, tilt, [(k, own.uniform(0.02, 0.06) / k ** 0.5, own.uniform(0, 6.28)) for k in (2, 3)], 12, box[0] if box else 2)
        if i: px, py = parts[i - 1][:2]; dist = np.hypot(px - cx, py - cy) or 1; dx, dy = (px - cx) / dist * 2.5, (py - cy) / dist * 2.5
        else: dx, dy = first
        tint = own.uniform(-vary, vary)
        out += f'''
    <g id="{name}-{i}"><defs><path id="{name}-{i}-shape" d="{d}"/></defs><use href="#{name}-{i}-shape" fill="{crease}" transform="translate({dx:.1f} {dy:.1f})"/><use href="#{name}-{i}-shape" fill="{shade(base, tint)}"/><use href="#{name}-{i}-shape" fill="{shade(light, tint)}" transform="matrix(.7 0 0 .7 {cx * 0.3 - rx * 0.12:.1f} {cy * 0.3 - ry * 0.18:.1f})"/></g>'''
    return out + '\n  </g>'

def rings(name, centers, rx, ry, base, light, crease, own, vary=0.05):
    # one ring shape reused for every ring, each a little resized, a dark fold under it and a light band on top
    d = wobbly(0, 0, rx, ry, 0, [(k, own.uniform(0.02, 0.05) / k ** 0.5, own.uniform(0, 6.28)) for k in (2, 3)], 12, 2.8)
    out = f'\n  <g id="{name}"><defs><path id="{name}-ring" d="{d}"/></defs>'
    for x, y, tilt in centers:
        tint = own.uniform(-vary, vary)
        out += f'''
    <g transform="translate({x:.1f} {y:.1f}) rotate({tilt:.0f}) scale({own.uniform(0.94, 1.06):.2f} 1)"><use href="#{name}-ring" fill="{crease}" transform="translate(0.5 2.4)"/><use href="#{name}-ring" fill="{shade(base, tint)}"/><use href="#{name}-ring" fill="{shade(light, tint)}" transform="matrix(.8 0 0 .45 -2.5 -2)"/></g>'''
    return out + '\n  </g>'

def back():
    own = random.Random(411)
    # the long squared tail block to the right, its purple underside showing below
    block = blob('ff-tail', uneven([(176, 196), (172, 172), (190, 146), (212, 127), (230, 110), (250, 96), (261, 95), (277, 107), (298, 126), (314, 140),
                                   (318, 156), (304, 170), (285, 182), (262, 192), (240, 200), (215, 204), (192, 203)], own), '#c8646b', '#4b3058', (-3, 8), [
        ('#9e4c5f', lump(262, 200, 62, 22, -22, own, 0.05)),
        ('#dc7d7b', lump(255, 128, 55, 26, 35, own, 0.05))],
        '\n      <ellipse cx="243" cy="108" rx="11" ry="2.6" fill="#f2b5ac" transform="rotate(-38 243 108)"/>')
    # the tall fin: a long rounded thumb leaning a little right, two folds over its foot
    tall = ('\n  <g id="ff-fin-tall">' + stack('ff-fin-top', [(201, 106, 25, 48, 12, 2.1)], '#d9836f', '#e99e86', '#99505a', '#f7c9b6', own)
            + flat('ff-fin-folds', [(190, 128, 18, 10, 12, 2.6), (187, 141, 17, 9, 12, 2.6)], '#d9836f', '#e99e86', '#99505a', own, 0.05, (1, -2.5)) + '\n  </g>')
    # the lower fin: a long slender petal from the joint behind the head down to the right
    low = stack('ff-fin-low', [(198, 211, 49, 13, 47, 2.2)], '#a35a6c', '#c27d86', '#55304d', '#e2b0b2', own)
    # the ringed antenna: rings from the head up, a knuckle and a round cap, bending right toward the tip
    antenna = ('\n  <g id="ff-antenna">' + rings('ff-rings', [(108.5 + 0.4 * i + 0.2 * i * i, 127 - 7.5 * i, 18 + 2 * i) for i in range(7)], 16.5, 6, '#bf5f63', '#d8817c', '#7a3746', own)
               + stack('ff-antenna-tip', [(134, 59, 21, 28, 30, 2.2)], '#c26265', '#d8817c', '#7a3746', '#f5c0b2', own))
    # a lighter nail over the tip, its lower edge a dark fold
    antenna += f'''
  <g clip-path="url(#ff-antenna-tip-0-clip)"><defs><path id="ff-nail" d="{lump(143, 46, 18, 15, 36, own, 0.05, 10)}"/></defs><use href="#ff-nail" fill="#7a3746" transform="translate(-1 2.5)"/><use href="#ff-nail" fill="#e89a8c"/><ellipse cx="140" cy="40" rx="6" ry="2.6" fill="#f8c6b8" transform="rotate(4 140 40)"/></g>
  </g>'''
    # small leafy bits where the fins meet the head
    leaves = (flat('ff-petals', [(152, 156, 5, 14, -32), (161, 153, 5, 15, -18)], '#bd6470', '#cf7d82', '#6e3450', own, 0.05)
              + flat('ff-leaves', [(150, 141, 6, 14, -25), (162, 135, 8, 16, 14)], '#9a7aa3', '#b593b8', '#56406a', own, 0.08))
    mid = stack('ff-fin-mid', [(188, 154, 35, 15, -15, 2.5)], '#d48782', '#e3a19b', '#8c3d4b', '#f6cdc6', own)
    legs = (leg('ff-leg-back', 166, 277, 11, 9, 46, -28, '#4f5279', '#626792', '#2c2e48')
            + leg('ff-leg-mid', 146, 272, 26, 20, 32, -6, '#857ca7', '#9c95bc', '#3d3a5e')
            + leg('ff-leg-front', 99, 272, 11, 9, 30, -4, '#8784b0', '#b4afcc', '#3c3d5e'))
    return block + tall + low + antenna + leaves + mid + legs

def eye(i, x, y, rx, ry, tilt, rim, white, pupil):
    # the rim is the white pushed down-right, so it shows only as a lower-right crescent
    b = bumps(0.04)
    px, py, prx, pry = pupil
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 2, y + 2, rx + 1.5, ry + 1.5, tilt, b, 12)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, tilt, b, 12)}"/>
      <g><path fill="#3d4352" d="{wobbly(px, py, prx, pry, tilt, bumps(0.03), n=10)}"/><circle cx="{px - prx * 0.4:.1f}" cy="{py - pry * 0.42:.1f}" r="{prx * 0.2:.1f}" fill="#fff"/></g>
    </g>'''

def extra():
    own = random.Random(412)
    head_pts = [(52, 103), (62, 105), (74, 110), (88, 119), (104, 130), (120, 140), (134, 150), (148, 161), (160, 175), (169, 192), (177, 213), (176, 230),
                (170, 243), (158, 253), (140, 261), (120, 268), (102, 270), (97, 264), (97, 256), (80, 246), (66, 236), (58, 220), (55, 202),
                (57, 182), (64, 163), (75, 149), (82, 139), (75, 128), (62, 118), (53, 110)]
    head = blob('ff-head', uneven(head_pts, own), '#e2e0e6', '#3e3c58', (0.8, 1.6), [
        ('#c8c5d0', lump(170, 222, 22, 34, 0, own, 0.05)),
        ('#77729c', lump(166, 256, 34, 13, -20, own, 0.05)),
        ('#a2a2b4', lump(95, 197, 37, 34, -5, own, 0.04)),
        ('#8d8aac', lump(104, 259, 46, 8, -14, own, 0.05)),
        ('#c2c2cc', lump(68, 197, 11, 26, 12, own, 0.05)),
        ('#f6f5f7', lump(104, 146, 48, 17, 35, own, 0.05))],
        '\n      <ellipse cx="92" cy="125" rx="24" ry="2.8" fill="#ffffff" transform="rotate(33 92 125)"/>')
    nub = blob('ff-nub', lump(52, 228, 10, 9, -15, own, 0.04, 10, 3.2), '#d2d9ee', '#5b5e82', (0.8, 1.6), [('#fbfcfd', lump(50, 225, 8, 6, -15, own, 0.05, 10, 3))])
    return head + nub + f'''
  <g id="ff-eyes">{eye(0, 89, 196, 29, 26, -5, '#3f425e', '#f8f8f8', (89.5, 193, 17.5, 14.5))}
  </g>'''
