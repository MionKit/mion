# The red mushroom mion, built by hand: a domed cap on a stem and round foot, a pink bobble, a fin behind, one lumpy eye.
import random, re
from common import stack, cone, wobbly, through

rand = random.Random(5)
bumps = lambda size: [(k, rand.uniform(0.01, size) / k ** 0.5, rand.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, box=2, size=0.05, n=14):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size), n, box))

def part(d, cx, cy, rx, ry, tilt=0):  # a ready shape as a stack part
    return dict(d=d, cx=cx, cy=cy, rx=rx, ry=ry, tilt=tilt)

def outline(points, cx, cy, rx, ry):  # a big shape through hand-measured points, a little uneven
    return part(through([(x + rand.uniform(-1, 1), y + rand.uniform(-1, 1)) for x, y in points]), cx, cy, rx, ry)

def back():  # the bobble tucks under the cap's upper left; the fin peeks out left of the stem and its grey end hides behind the foot
    bobble = stack('rm-bobble', [part(wobbly(35, 49, 13.5, 14.5, -15, bumps(0.04), 10), 35, 49, 13.5, 14.5, -15)], '#cf8a90', '#eeb0b1', '#93596a', '#fbe3e2', rand)
    stalk = '\n  <ellipse cx="46" cy="54" rx="3.5" ry="4.5" fill="#e6e2ec"/>'   # the pale knot where the bobble meets the cap
    # a pointed fin wide enough to reach under the stem's leaning left edge; the lit copy keeps its left pale and its right grey
    lobe = part(lump(86, 223, 21, 18, 10), 86, 223, 21, 18, 10)
    fin = stack('rm-fin', [lobe, cone(92, 182, 9, 40, 68, 7, rand)], '#8c8ea3', '#d0d4dd', '#55566c', '#f4f6f9', rand, vary=0.05)
    return bobble + stalk + fin

def eye(i, x, y, rx, ry, px, py, prx, pry, rim, white):
    # the rim is the white pushed down-right, so it shows only as a lower-right crescent
    b = bumps(0.04)
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1.5, y + 2, rx + 2.5, ry + 2.5, -10, b, 12)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, -10, b, 12)}"/>
      <g><ellipse cx="{px}" cy="{py}" rx="{prx}" ry="{pry}" fill="#2b2d38" transform="rotate(-10 {px} {py})"/><circle cx="{px - prx * 0.35:.1f}" cy="{py - pry * 0.4:.1f}" r="{prx * 0.32:.1f}" fill="#fff"/></g>
    </g>'''

def extra():
    # the stem leans in on its left under the fin; the foot, brighter than the shaded stem, sits over its lower end
    stem_shape = outline([(97, 145), (124, 142), (150, 146), (153, 188), (153, 232), (130, 238), (108, 232), (108, 205), (101, 176)], 126, 190, 24, 46)
    stem = stack('rm-stem', [stem_shape], '#6a2a33', '#923238', '#4a1c25', '#9b383b', rand)
    foot = stack('rm-foot', [part(lump(113, 251, 44, 24, -12, 2.6), 113, 251, 44, 24, -12)], '#a8403b', '#c8524a', '#5a1f27', '#f2c0b0', rand)
    cap_shape = outline([(105, 20), (132, 27), (152, 42), (168, 62), (178, 82), (181, 103), (176, 124), (162, 139), (140, 150), (105, 155),
                         (72, 151), (48, 140), (33, 123), (29, 103), (33, 80), (43, 61), (60, 39), (80, 25)], 105, 88, 76, 67)
    cap = stack('rm-cap', [cap_shape], '#bf5047', '#dc6852', '#5e1f2a', '#ffd6c8', rand)
    return f'''
  <g id="rm-body">{stem}
{foot}{cap}
  <g clip-path="url(#rm-cap-0-clip)">
    <path d="{lump(94, 64, 60, 42, -12, 2, 0.05, 10)}" fill="#f09883"/>
    <ellipse cx="93" cy="29" rx="10" ry="3.5" fill="#fbbfad" transform="rotate(-10 93 29)"/>
  </g>
  </g>
  <g id="rm-spots">
    <ellipse cx="95" cy="55" rx="3.6" ry="3.2" fill="#fcdcd0"/>
    <ellipse cx="152" cy="125" rx="3" ry="4" fill="#ece6ea"/>
    <ellipse cx="44" cy="123" rx="3.4" ry="4" fill="#e3ab8c"/>
    <ellipse cx="115" cy="145" rx="2.6" ry="2.2" fill="#d6b3aa"/>
  </g>
  <g id="rm-eyes">{eye(0, 114.5, 94.3, 28, 28.5, 125.5, 97, 9.5, 12, '#6e3138', '#f6f7f5')}
  </g>'''
