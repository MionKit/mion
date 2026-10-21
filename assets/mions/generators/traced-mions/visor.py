# The visor mion, built by hand: a pale mint triangle with a lavender patch on top, a black visor with a glint in its lower left bowl,
# a blue disc on its right side holding a small purple eye, and a lavender fin poking out under the disc.
import random, re
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

def outline(points, own, j=0.8, digits=0):  # a shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-j, j), y + own.uniform(-j, j)) for x, y in points], digits=digits)

def blob(name, d, base, line, push, tones):
    # a flat shape over its dark copy moved by `push`, with lighter tones clipped inside it; a tone is (colour, path) or ready markup
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{line}" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join('\n      ' + (t if isinstance(t, str) else f'<path d="{t[1]}" fill="{t[0]}"/>') for t in tones) + '''
    </g>
  </g>'''

def back():  # the fin: a hidden root under the disc and the blade sticking out to the lower right
    own = random.Random(42)
    blade = outline([(165, 153.5), (172, 154.8), (176.5, 158), (178.5, 162), (178, 167), (175, 171), (167, 174), (158, 174.5), (150, 172.5),
                     (144, 169), (139, 165.5), (136, 162), (140, 159.5), (149, 156.5), (158, 154)], own, 0.4, 1)
    return stack('vs-fin', [(147, 157, 9, 6, 10, 3), dict(d=blade, cx=160, cy=164, rx=20, ry=10, tilt=6)], '#7474a6', '#9796c6', '#34364f', '#c9c7ea', own, 0.04)

def eye(i, rim, push, hole, inner):  # rim, then the white (here a dark hole), then the moving group last
    rim_d, hole_d = hole
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{rim_d}" transform="translate({push[0]} {push[1]})"/>
      {hole_d}
      <g>{inner}</g>
    </g>'''

def extra():
    own = random.Random(411)   # the big shapes take their own stream, so they never shift when a small part changes
    top = [(113.5, 38), (120, 40), (125, 44), (129.5, 49), (134, 56), (139, 64), (144, 72), (149, 80), (155, 88), (161.5, 96), (167, 104)]
    left = [(65.5, 116), (67.5, 112), (71.5, 104), (75.5, 96), (80, 84), (85.5, 72), (90.5, 60), (95.5, 52), (99, 47), (103, 42.5), (108, 39.5)]
    lower = [(170, 116), (168, 135), (158, 150), (140, 160), (122, 164.5), (106, 168.5), (95, 169.5), (86, 168), (77, 164),
             (70, 159.5), (64, 154.5), (59.5, 149), (56.5, 142), (56, 134), (57, 126.5), (60, 121), (62.5, 118.5)]
    top, left, lower = ([(x + own.uniform(-0.35, 0.35), y + own.uniform(-0.35, 0.35)) for x, y in edge] for edge in (top, left, lower))   # the face shares the body's edges
    body_pts = top + lower + left
    # the mint face: the triangle down to the visor's top edge and the disc
    mint_pts = top + [(165, 118), (140, 126), (116, 127.5), (112, 131), (106, 131), (97, 128.5), (88, 126.5), (79, 125), (72, 122),
                      (66.5, 119.5), (64.5, 118)] + left
    mint = blob('vs-mint', through(mint_pts), '#b5bdb5', '#94a3ad', (0, 1.6), [
        ('#a9b7b6', lump(142, 125, 31.5, 33, 0, own, 0.02, 12)),
        ('#c1c9c1', lump(104, 72, 26, 44, 24, own, 0.04)),
        ('#d5dad1', lump(93, 64, 8, 30, 27, own, 0.05)),
        ('#e8eae6', lump(108, 46, 10, 6, -10, own, 0.05)),
        '<ellipse cx="99" cy="55" rx="2.2" ry="8" fill="#f4f6f0" transform="rotate(27 99 55)"/>'])
    body = blob('vs-body', through(body_pts), '#6e839f', '#3a4660', (0.5, 1.2), [
        ('#899dba', lump(90, 152, 32, 13, 12, own, 0.04)),
        ('#b4c2cd', lump(62, 137, 5.5, 17, 10, own, 0.05)),
        ('#eef2f1', lump(68, 142, 8.5, 5.8, 28, own, 0.06, 8)),
        mint])
    patch = blob('vs-patch', outline([(115, 43.5), (121, 45.5), (124.5, 50), (125, 58), (124.5, 66), (122, 73), (119.5, 79), (116.5, 84),
                                       (112.5, 80), (108.5, 75.5), (106.5, 69), (106, 61), (107, 52), (110, 46.5)], own, 0.3, 1),
                 '#a7aabd', '#868b9e', (0.6, 1.4), [
        ('#b6b8ca', lump(114.5, 60, 9, 17, 3, own, 0.05, 8)),
        ('#d4d5e1', lump(111.5, 56, 5, 10.5, 6, own, 0.05, 8)),
        ('#80869a', lump(116.5, 83, 3.5, 3.5, 0, own, 0.05, 8))])
    disc_pts = [(174, 127), (170.5, 137.5), (165, 146), (157, 152), (148, 156.5), (137, 158.5), (125, 154), (116.5, 145), (113, 135),
                (114.5, 126), (118, 117.5), (122, 109), (128, 100.5), (137.5, 95.5), (149, 94), (160, 97), (168.5, 105.5), (172.6, 116)]
    face = lump(146, 123.5, 25, 27, 0, own, 0.025, 12)
    disc = blob('vs-disc', outline(disc_pts, own, 0.4), '#7591ac', '#34415e', (-1.2, 1.4), [
        ('#5b7192', lump(136, 140, 24, 22, 30, own, 0.03)),
        f'<defs><path id="vs-face" d="{face}"/></defs><use href="#vs-face" fill="#5a7293" transform="translate(-1 -1)"/><use href="#vs-face" fill="#6882a1"/>',
        ('#7390aa', lump(146, 108, 17, 8, 0, own, 0.04)),
        '<ellipse cx="125" cy="112" rx="1.8" ry="6.5" fill="#a9c0cf" transform="rotate(35 125 112)"/>'])
    lens = outline([(62.5, 121.5), (65, 118), (70, 119), (76, 122), (82, 123.8), (91, 125), (97, 127), (103, 129), (108, 131), (110.5, 135),
                    (110, 141), (107.5, 147), (103, 151.5), (97, 154.5), (90, 154.5), (84, 151.5), (79, 147), (76, 142), (73, 137),
                    (69.5, 135.5), (65.5, 136), (63, 131)], own, 0.2, 1)
    socket = wobbly(149, 119, 10, 14, 6, bumps(0.04, own), 12)
    eye0 = eye(0, '#26304a', (0.9, 1.3), (lens, f'<path fill="#1b1f2c" d="{lens}"/>'),
               '<ellipse cx="97.8" cy="139.3" rx="2.9" ry="3.8" fill="#eef2f8" transform="rotate(10 97.8 139.3)"/><circle cx="94" cy="143.5" r="0.9" fill="#8d98b4"/>')
    eye1 = eye(1, '#262744', (1, 1.3), (socket, f'<path fill="#3d3d64" d="{socket}"/>'),
               f'<path fill="#874a72" d="{wobbly(150.5, 120.5, 4.4, 7.2, 6, bumps(0.05, own), 10)}"/><ellipse cx="152.3" cy="122" rx="1.5" ry="3.2" fill="#c27aa8" transform="rotate(6 152.3 122)"/>'
               '<circle cx="149.3" cy="113.6" r="2.1" fill="#e6d0e0"/>')
    return body + patch + disc + f'''
  <g id="vs-eyes">{eye0}{eye1}
  </g>'''
