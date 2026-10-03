# The blue helmet mion, built by hand: a lumpy round helmet, curved antennae stacked from uneven pieces, cone-section legs, and two lumpy eyes.
import random
from common import stack, cone, wobbly

rand = random.Random(21)
bumps = lambda size: [(k, rand.uniform(0.01, size) / k ** 0.5, rand.uniform(0, 6.28)) for k in (2, 3, 4)]

def leg(name, x, tilt, foot=False):  # two cone sections, the top one wide under the body; one leg ends in a round foot
    return stack(name, [cone(x, 252, 40, 21, 26, tilt, rand), cone(x - tilt * 0.4, 276, 20, 14, 24, tilt, rand)]
                 + ([(x - tilt * 0.7, 294, 11, 9, 0)] if foot else []), '#4a4f78', '#6b70a0', '#2b2e4a', '#a3a7cf', rand, vary=0.06)

def back():  # antennae bend along a curve and their bases tuck under the helmet; lower pieces a little boxy, tops round
    leaf = stack('leaf', [(43, 82, 21, 9, -16), (27, 79, 11, 6, -22)], '#b4a6cd', '#d2c8e6', '#7e7199', '#efeaf7', rand, vary=0.06)
    # its cone base points straight out from the helmet's center, so the base's lower edge follows the curve there
    own = random.Random(33)   # its own stream: its cone base takes other draws than an oval, and the parts after it must not shift
    blue = stack('antenna-blue', [cone(72, 109, 14, 26, 18, -25, own), (66, 94, 8, 12, -16, 3), (61, 79, 11, 8, -26, 3), (53, 58, 17, 20, -34)], '#4f9fc2', '#83c9e2', '#2c6683', '#c7eef7', own, vary=0.08)
    for _ in range(32): rand.random()   # the draws this antenna used to take, so the white and red ones and the legs keep their shapes
    white = stack('antenna-white', [(112, 103, 10, 21, 4, 3), (111, 79, 14, 16, 12, 3), (117, 54, 18, 22, 22)], '#d6d3e0', '#f1f0f5', '#9895a9', '#ffffff', rand, vary=0.05)
    red = stack('antenna-red', [(150, 115, 14, 10, -22, 3), (165, 99, 16, 13, -40, 3), (176, 78, 19, 16, -58)], '#d15d5c', '#ee8781', '#8f343c', '#ffd2cc', rand, vary=0.08)
    global front_antenna
    front_antenna = leaf + blue   # built here so every shape stays the same, drawn in front of the helmet by extra()
    return white + red + leg('leg-left', 74, 16) + leg('leg-right', 136, -18)

def eye(i, x, y, rx, ry, pupil, rim, white):
    # the rim is the white's own shape pushed down-right, so it shows as a crescent there and the upper left has no border
    b = bumps(0.05)
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 2, y + 2.5, rx + 3, ry + 3, -10, b)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, -10, b)}"/>
      <g><circle cx="{x + 1}" cy="{y + 1}" r="{pupil}" fill="#1b2635"/><circle cx="{x - pupil * 0.3:.1f}" cy="{y - pupil * 0.35:.1f}" r="{pupil * 0.3:.1f}" fill="#fff"/></g>
    </g>'''

def extra():
    front = leg('leg-middle', 105, 2, foot=True)   # over the helmet's lower edge, so it reads as the leg in front
    outline = bumps(0.035)
    shell = lambda cx, cy, rx, ry: wobbly(cx, cy, rx, ry, -6, outline)
    return f'''
  <g id="helmet">
    <clipPath id="bh-helmet-clip"><path d="{shell(104, 178, 73, 71)}"/></clipPath>
    <path d="{shell(104, 178, 73, 71)}" fill="#22405a"/>
    <g clip-path="url(#bh-helmet-clip)">
      <path d="{wobbly(98, 167, 68, 60, -8, bumps(0.04))}" fill="#3b7fa3"/>
      <path d="{wobbly(91, 152, 57, 45, -10, bumps(0.05))}" fill="#5fb0cf"/>
      <ellipse cx="79" cy="133" rx="22" ry="9" fill="#9ad6e8" transform="rotate(-18 79 133)"/>
    </g>
  </g>{front}{front_antenna}
  <g id="eyes">{eye(0, 78, 192, 22.5, 21.5, 9.5, '#1f3a4e', '#eef4f6')}{eye(1, 147, 165, 20, 17, 7.5, '#2c6680', '#e2f2f6')}
  </g>
  <g id="glass" fill="#ffffff" opacity="0.55">
    <ellipse cx="70" cy="181" rx="7" ry="4" transform="rotate(-32 70 181)"/>
    <ellipse cx="140" cy="156" rx="5.5" ry="3" transform="rotate(-25 140 156)"/>
  </g>'''
