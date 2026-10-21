# The pig mion, built by hand: a round belly, a pale head on its right, a teal ear, a jaw lobe, cone legs, a big and a small eye.
import random, re
from common import stack, cone, wobbly, through

rand = random.Random(13)
bumps = lambda size, rand=rand: [(k, rand.uniform(0.01, size) / k ** 0.5, rand.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=14, box=2):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n, box))

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

def leg(name, x, y, h, tilt, base, light, crease):  # one short cone, wide where it hangs from the belly, splayed by tilt, a slimmer lit cone inside
    shape = cone(x, y, 14, 9, h, tilt, rand)['d']
    for _ in range(3): rand.random()   # the draws a stack would take here, so the eyes keep their shapes
    lit = cone(x - 1.5 - tilt * 0.1, y - 2, 8, 5, h - 6, tilt)['d']
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{shape}"/></defs>
    <use href="#{name}-shape" fill="{crease}" transform="translate(0.6 1.5)"/>
    <use href="#{name}-shape" fill="{base}"/>
    <path d="{lit}" fill="{light}"/>
  </g>'''

def back():  # the ear leans right behind the head, teal below and pink at its tip; the far leg hides in the belly's shadow
    ear = stack('pig-ear-base', [cone(119, 49, 30, 11, 46, 6, rand)], '#4d7579', '#6a9396', '#2c4346', '#9cc2c2', rand)
    tip = stack('pig-ear-tip', [(122, 16, 14, 11.5, 10, 2.4)], '#c49aa8', '#dcbac4', '#8a6676', '#f3e1e6', rand)
    far = leg('pig-leg-back', 29, 146, 24, 10, '#64647f', '#76769a', '#35314a')
    return f'\n  <g id="pig-ear">{ear}{tip}\n  </g>{far}'

def eye(i, x, y, rx, ry, tilt, rim, white, pupil, iris=''):
    # the rim is the white pushed down-right, so it shows only as a lower-right crescent
    b = bumps(0.04)
    px, py, prx, pry = pupil
    inner = f'<path fill="{iris}" d="{wobbly(px + 1.2, py + 1.2, prx * 0.6, pry * 0.6, tilt, bumps(0.04), n=8)}"/>' if iris else ''
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1.5, y + 2, rx + 2.2, ry + 2.2, tilt, b, 12)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, tilt, b, 12)}"/>
      <g><path fill="#323a52" d="{wobbly(px, py, prx, pry, tilt, bumps(0.04), n=10)}"/>{inner}<circle cx="{px - prx * 0.35:.1f}" cy="{py - pry * 0.45:.1f}" r="{max(1.1, prx * 0.24):.1f}" fill="#fff"/></g>
    </g>'''

def extra():
    own = random.Random(131)   # the belly and head take their own stream, so they never shift when a small part changes
    # the belly runs on under the head, so the head sits into it rather than beside it
    belly_pts = [(75, 37), (95, 39), (108, 46), (117, 62), (130, 85), (142, 115), (140, 150), (122, 163), (100, 166), (80, 164), (60, 158),
                 (42, 147), (28, 132), (20, 108), (21, 88), (30, 66), (48, 47)]
    belly = blob('pig-belly', through([(x + own.uniform(-1, 1), y + own.uniform(-1, 1)) for x, y in belly_pts]), '#8a8ca8', '#4a485e', (0.6, 2), [
        ('#a2a3b6', lump(72, 90, 58, 57, 8, own, 0.04, 12)),
        ('#b9b8bf', lump(68, 80, 52, 46, 4, own, 0.04, 12)),
        ('#dbe3e9', lump(76, 63, 31, 25, -8, own, 0.05, 10)),
        ('#e9eef1', lump(84, 54, 17, 11, -10, own, 0.06, 10))],
        '\n      <ellipse cx="48" cy="103.5" rx="5" ry="5.5" fill="#fcfcf9" transform="rotate(10 48 103.5)"/>'
        '\n      <ellipse cx="82" cy="107" rx="1.7" ry="1.1" fill="#4a4757" transform="rotate(-30 82 107)"/>')
    pale = ('#8b8dab', '#a3a5bf', '#4b4862')
    legs = leg('pig-leg-front', 59, 165, 26, 5, *pale) + leg('pig-leg-near', 99, 174, 28, -3, *pale)
    chin = blob('pig-chin', lump(142, 167, 30, 11, -6, own, 0.04, 12), '#8487a3', '#4f4d64', (0, 1.5), [('#9fa2bb', lump(139, 165, 26, 8, -6, own, 0.05, 10))])
    head_pts = [(118, 72), (136, 65), (155, 64), (172, 70), (186, 84), (193, 102), (193, 124), (186, 144), (172, 157), (152, 164),
                (130, 162), (113, 155), (102, 141), (96, 121), (95, 101), (102, 84)]
    head = blob('pig-head', through([(x + own.uniform(-1, 1), y + own.uniform(-1, 1)) for x, y in head_pts]), '#a2a3b8', '#8a8ca8', (-1, 1.5), [
        ('#c8cbd3', lump(158, 110, 38, 36, -10, own, 0.04)),
        ('#f1f4f6', lump(135, 97, 42, 38, -10, own, 0.05))],
        '\n      <ellipse cx="130" cy="70" rx="11" ry="3.5" fill="#ffffff" transform="rotate(-12 130 70)"/>')
    snout = blob('pig-snout', lump(177, 104, 17, 10.5, 32, own, 0.05, 12), '#e3e5ea', '#4b4955', (0.4, 2.6), [('#f2f4f6', lump(175, 101, 13, 7, 32, own, 0.06, 10))])
    mouth = through([(124, 159.5), (140, 164), (158, 164), (174, 157.5), (184, 149)], closed=False, digits=1)
    face = f'''
  <g id="pig-face" fill="#45434f">
    <path d="{mouth}" fill="none" stroke="#4a4759" stroke-width="1.6" stroke-linecap="round"/>
    <path d="{wobbly(139, 133, 2.6, 1.7, 15, bumps(0.06), n=8)}"/>
    <path d="{wobbly(145, 150, 3.2, 1.2, -12, bumps(0.06), n=8)}"/>
  </g>'''
    return belly + legs + chin + head + snout + face + f'''
  <g id="pig-eyes">{eye(0, 121, 109, 16, 13.5, -15, '#46505f', '#eef1f4', (123.5, 107.5, 9.5, 8), '#56628a')}{eye(1, 146, 79, 6.5, 6, -10, '#3c4250', '#e8ebee', (146.8, 79.6, 5.2, 4.8))}
  </g>'''
