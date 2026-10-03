# The seal mion, built by hand: a white head on a lavender body, a ringed horn bending right, an ear, cone legs, two eyes.
import random, re
from common import stack, cone, wobbly, through

rand = random.Random(8)
bumps = lambda size, r=None: [(k, (r or rand).uniform(0.01, size) / k ** 0.5, (r or rand).uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, box=2, size=0.05, n=14, r=None):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, r), n, box))

def part(d, cx, cy, rx, ry, tilt=0):  # a ready shape as a stack part
    return dict(d=d, cx=cx, cy=cy, rx=rx, ry=ry, tilt=tilt)

def outline(points, cx, cy, rx, ry, r=None):  # a big shape through hand-measured points, a little uneven
    return part(through([(x + (r or rand).uniform(-1, 1), y + (r or rand).uniform(-1, 1)) for x, y in points]), cx, cy, rx, ry)

LEG = ('#5e6086', '#757a9c', '#3a3852', '#9ea3c2')   # the body's lavender, a little darker under the belly

def back():  # one dark shadow wedge behind both legs, then the left leg and the ear, which tuck under the head
    shade = outline([(66, 199), (94, 199), (122, 202), (127, 214), (119, 229), (113, 231), (105, 219), (80, 213), (67, 207)], 0, 0, 0, 0, random.Random(9))['d']
    for _ in range(14): rand.random()   # the draws the two old dark stumps took, so the ear, head and eyes keep their shapes
    far = f'''
  <path id="seal-leg-shadow" fill="#3f3248" d="{shade}"/>'''
    near = stack('seal-leg-left', [cone(100, 214, 28, 13, 32, 32, rand)], *LEG, rand)
    # a leaf-shaped ear, wide at the base and narrowing to a round tip leaning left
    ear = stack('seal-ear', [outline([(66, 71), (74, 76), (81, 84), (86, 94), (87, 103), (76, 107), (65, 105), (60, 96), (60, 85), (62, 76)], 73, 90, 12, 17)], '#a5a4b4', '#e6e6ec', '#6a6270', '#ffffff', rand)
    return far + near + ear

def eye(i, x, y, rx, ry, pupil, pupil_col, rim, white):
    # the rim is the white pushed down-right, so it shows only as a lower-right crescent
    b = bumps(0.05)
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1.5, y + 2, rx + 2, ry + 2, -10, b, 8)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, -10, b, 8)}"/>
      <g><circle cx="{x + 1}" cy="{y + 1}" r="{pupil}" fill="{pupil_col}"/><circle cx="{x - pupil * 0.25:.1f}" cy="{y - pupil * 0.3:.1f}" r="{pupil * 0.3:.1f}" fill="#fff"/></g>
    </g>'''

def extra():
    body = stack('seal-body', [part(lump(140, 165, 34, 42, -8, 2.4, 0.05, 10), 140, 165, 34, 42, -8)], '#646889', '#7b82a1', '#3e3d58', '#a3a8c6', rand)
    # the wide right leg tucks under the body's lower edge so the two read as one, and narrows to a small foot
    right = stack('seal-leg-right', [cone(138, 211, 40, 10, 38, 14, rand)], *LEG, rand)
    head_shape = outline([(20, 152), (26, 135), (40, 123), (60, 112), (80, 104), (100, 98), (120, 102), (133, 120),
                          (141, 142), (145, 166), (139, 185), (126, 195), (108, 201), (86, 204), (64, 200), (44, 191), (29, 178)], 84, 152, 63, 52)
    head = stack('seal-head', [head_shape], '#acaec0', '#e4e5ec', '#757790', '#ffffff', rand)
    # the horn: rings narrowing to half the base width, leaning gently right, each hiding most of the one below, a round cap
    lean = (0.41, -0.91)   # the axis leans about 24 degrees right; rings step 15 px along it and bend a little more near the top
    rings = [(133 + lean[0] * 15 * i + 0.2 * i * i, 119 + lean[1] * 15 * i, rx, 16, 22 + i * 1.2, 2.4) for i, rx in enumerate((35, 31, 27, 23, 19))]
    rings.append((166, 49, 15, 14, 25))
    own = random.Random(13)   # its own stream, and the shared one skips the draws the old four-piece horn took, so the face keeps its shapes
    horn = stack('seal-horn', [part(lump(*r[:5], r[5] if len(r) > 5 else 2, 0.03, 8, own), *r[:5]) for r in rings], '#3f8a9e', '#72bfd0', '#2d6676', '#c4eef8', own, vary=0.05)
    for _ in range(40): rand.random()
    # the lit face: white up to the outline on the top and left, its right edge bulging so the grey wraps the lower right as a crescent
    lit = outline([(12, 130), (40, 108), (80, 94), (114, 94), (122, 118), (126, 146), (121, 172), (106, 189), (80, 197), (48, 193), (16, 178)], 0, 0, 0, 0)['d']
    return f'''
  <g id="seal-whole">{right}{body}{head}
  <g clip-path="url(#seal-head-0-clip)">
    <path d="{lit}" fill="#f6f4f3"/>
  </g>{horn}
  <g clip-path="url(#seal-horn-5-clip)"><ellipse cx="171" cy="33" rx="14" ry="9" fill="#a6e0ec" transform="rotate(25 171 33)"/></g>
  </g>
  <g id="seal-freckles" fill="#b07a82">
    <circle cx="37" cy="171" r="1.6"/><circle cx="52" cy="182" r="1.5"/><circle cx="63" cy="188" r="1.4"/>
    <ellipse cx="53" cy="152" rx="2.2" ry="0.9" fill="#9b9ca8" transform="rotate(30 53 152)"/><ellipse cx="88" cy="190" rx="1.2" ry="1.6" fill="#7d7e8c"/>
  </g>
  <g id="seal-eyes">{eye(0, 35, 146, 8, 8.5, 6.5, '#45434f', '#4a4858', '#f4f2f0')}{eye(1, 81, 160, 7.5, 7.5, 6, '#16171e', '#4a4858', '#f4f2f0')}
  </g>'''
