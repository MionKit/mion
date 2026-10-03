# Hand-built parts of the blue helmet mion: antennae stacked from a few uneven shapes, the round helmet, and its lens and visor as eyes.
import random
from common import stack, cone

rand = random.Random(21)

def back():  # antennae, drawn behind the helmet so their bases tuck under it; lower pieces a little boxy, tops round
    leaf = stack('leaf', [(38, 81, 21, 9, -12), (22, 77, 11, 6, -16)], '#b4a6cd', '#d2c8e6', '#7e7199', '#efeaf7', rand)
    blue = stack('antenna-blue', [(63, 101, 8, 24, -4, 3), (61, 77, 11, 8, -6, 3), (57, 53, 17, 20, -8)], '#4f9fc2', '#83c9e2', '#2c6683', '#c7eef7', rand)
    white = stack('antenna-white', [(112, 102, 10, 21, 8, 3), (108, 78, 14, 16, 4, 3), (109, 52, 18, 22, -6)], '#d6d3e0', '#f1f0f5', '#9895a9', '#ffffff', rand)
    red = stack('antenna-red', [(152, 123, 14, 10, -30, 3), (168, 110, 16, 13, -30, 3), (187, 97, 19, 16, -30)], '#d15d5c', '#ee8781', '#8f343c', '#ffd2cc', rand)
    # legs: two cone sections each, the top one wide under the body so the leg reads as one long taper; the middle one ends in a round foot
    global leg
    leg = lambda name, x, tilt, foot=False: stack(name, [cone(x, 252, 40, 21, 26, tilt, rand), cone(x - tilt * 0.4, 276, 20, 14, 24, tilt, rand)]
                                                 + ([(x - tilt * 0.7, 294, 11, 9, 0)] if foot else []), '#4a4f78', '#6b70a0', '#2b2e4a', '#a3a7cf', rand)
    legs = leg('leg-left', 74, 16) + leg('leg-right', 136, -18)
    return leaf + blue + white + red + legs

def eye(i, x, y, rx, ry, pupil, rim, white):
    return f'''
    <g id="eye-{i}">
      <ellipse cx="{x}" cy="{y}" rx="{rx + 4.5}" ry="{ry + 4.5}" fill="{rim}"/>
      <ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{white}"/>
      <g><circle cx="{x + 1}" cy="{y + 1}" r="{pupil}" fill="#1b2635"/><circle cx="{x - pupil * 0.3:.1f}" cy="{y - pupil * 0.35:.1f}" r="{pupil * 0.3:.1f}" fill="#fff"/></g>
    </g>'''

def extra():  # the middle leg comes first here, over the helmet's lower edge, so it reads as the leg in front
    front = leg('leg-middle', 105, 2, foot=True)
    return f'''
  <g id="helmet">
    <clipPath id="bh-helmet-clip"><ellipse cx="104" cy="184" rx="71" ry="65"/></clipPath>
    <ellipse cx="104" cy="184" rx="71" ry="65" fill="#22405a"/>
    <g clip-path="url(#bh-helmet-clip)">
      <ellipse cx="98" cy="172" rx="66" ry="56" fill="#3b7fa3"/>
      <ellipse cx="92" cy="160" rx="56" ry="42" fill="#5fb0cf"/>
      <ellipse cx="80" cy="143" rx="22" ry="9" fill="#9ad6e8" transform="rotate(-18 80 143)"/>
    </g>
  </g>{front}
  <g id="eyes">{eye(0, 78, 192, 22.5, 21.5, 9.5, '#1f3a4e', '#eef4f6')}{eye(1, 147, 165, 20, 17, 7.5, '#2c6680', '#e2f2f6')}
  </g>
  <g id="glass" fill="#ffffff" opacity="0.55">
    <ellipse cx="70" cy="181" rx="7" ry="4" transform="rotate(-32 70 181)"/>
    <ellipse cx="140" cy="156" rx="5.5" ry="3" transform="rotate(-25 140 156)"/>
  </g>'''
