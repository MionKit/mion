# The horn blob mion, built by hand: a pale pear body, a ridged cone horn leaning left, a pink ear flap, two eye holes, a swirl.
import random, re
from common import stack, wobbly, through

rand = random.Random(57)
bumps = lambda size, r=rand: [(k, r.uniform(0.01, size) / k ** 0.5, r.uniform(0, 6.28)) for k in (2, 3, 4)]

def outline(points, own, j=0.8, digits=0):  # a shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-j, j), y + own.uniform(-j, j)) for x, y in points], digits=digits)

def part(d, cx, cy, rx, ry, tilt=0):  # a ready shape as a stack part
    return dict(d=d, cx=cx, cy=cy, rx=rx, ry=ry, tilt=tilt)

def blob(name, d, base, line, push, tones, width=2):
    # the dark copy under the base shows as a thin outline, thicker toward `push`; a tone is (colour, path) or ready markup
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{line}" stroke="{line}" stroke-width="{width}" stroke-linejoin="round" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join('\n      ' + (t if isinstance(t, str) else f'<path d="{t[1]}" fill="{t[0]}"/>') for t in tones) + '''
    </g>
  </g>'''

def back():  # the pale tip pokes out from under the pink flap, and both tuck behind the body's right side
    own = random.Random(58)
    tip = outline([(140, 131), (152, 127), (167, 126), (181, 128), (191, 133), (194, 139), (190, 145), (179, 148), (166, 149), (155, 146), (146, 140), (140, 137)], own)
    flap = outline([(113, 82), (125, 84.5), (140, 90.5), (153, 99), (160, 107), (162, 116), (160, 124), (151, 128), (139, 128), (126, 118), (115, 100)], own)
    return (stack('hb-tip', [part(tip, 168, 137, 25, 10, 8)], '#969db7', '#bcc1d3', '#41455f', '#cdd1df', own)
            + stack('hb-ear', [part(flap, 140, 106, 13, 22, -50)], '#b39ab3', '#dcc8d8', '#4a3c55', '#dcc8d8', own))

def eye(i, x, y, rx, ry, tilt, rim, hole, inner):
    # the rim, pushed down-right, shows only as a crescent there; the moving glint group must come last
    b = bumps(0.05)
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1, y + 1.4, rx + 1.2, ry + 1.2, tilt, b, 10)}"/>
      <path fill="{hole}" d="{wobbly(x, y, rx, ry, tilt, b, 10)}"/>
      <g>{inner}</g>
    </g>'''

def extra():
    own = random.Random(571)   # the body and its tones take their own stream, so they never shift when a small part changes
    body = outline([(43, 74), (60, 67), (78, 64), (92, 66), (101, 69), (109, 75), (116, 83), (123, 93), (130, 103), (136, 113), (141, 123), (143, 133),
                    (141, 143), (135, 153), (124, 162), (111, 170), (97, 175), (83, 177), (69, 176), (57, 172), (46, 166), (35, 159), (25, 151),
                    (17, 141), (15, 130), (18, 119), (24, 108), (30, 97), (36, 86)], own)
    lower = outline([(5, 50), (160, 50), (150, 128), (139, 141), (127, 152), (113, 160), (98, 165), (81, 167), (64, 166), (50, 162), (38, 157), (24, 153), (5, 152)], own)
    mid = outline([(5, 50), (112, 50), (126, 92), (131, 112), (128, 130), (117, 143), (98, 151), (74, 153), (52, 149), (33, 143), (15, 135), (5, 125)], own)
    lit = outline([(20, 60), (104, 60), (118, 92), (116, 114), (102, 127), (78, 132), (55, 130), (36, 124), (22, 116)], own)
    top = outline([(30, 66), (100, 62), (110, 82), (101, 99), (80, 106), (56, 106), (38, 99), (30, 88)], own)
    skin = blob('hb-body', body, '#64779b', '#3f4f74', (0.5, 1.4), [
        ('#8ea3b4', lower),
        ('#a9b9c3', mid),
        ('#bccad2', lit),
        ('#cbd8de', top),
        '<ellipse cx="34" cy="111" rx="6.5" ry="2" fill="#cfdbe1" transform="rotate(-58 34 111)"/>'])
    # the horn: one cone leaning left, lighter toward the tip, with a U-shaped ridge drawn around its lower band
    hown = random.Random(572)
    horn_pts = [(55, 18), (61, 18.5), (67, 23), (73, 32), (79, 43), (84.5, 53), (89.5, 65), (89, 72.5), (84, 77.5), (75, 81), (65, 82.5), (54, 82), (45.5, 79),
                (42.5, 74), (43, 66), (45, 57), (46, 47), (45.5, 35), (47, 26), (50, 20.5)]
    upper = outline([(55, 18), (61, 18.5), (67, 23), (73, 32), (79, 43), (85, 55), (78, 59.5), (66, 58.5), (54, 58), (45, 56), (45.5, 35), (47, 26), (50, 20.5)], hown, 0.5, 1)
    upper_lit = outline([(55, 20.5), (61, 21), (66, 26), (71, 35), (74, 45), (69, 49), (59, 48.5), (51, 45), (49, 35), (50.5, 25)], hown, 0.5, 1)
    ridge = through([(54.5, 59), (55, 65.5), (58, 69.8), (66, 71.3), (73, 70.5), (76.5, 66), (77.3, 58), (76, 48)], closed=False, digits=1)
    horn = blob('hb-horn', outline(horn_pts, hown, 0.4, 1), '#e6b777', '#5a5040', (0.4, 1), [
        ('#efc68a', upper),
        ('#f7d6a0', upper_lit),
        f'<path d="{ridge}" fill="none" stroke="#d0a066" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>',
        '<ellipse cx="54.5" cy="30" rx="2" ry="5.5" fill="#fbe3b6" transform="rotate(14 54.5 30)"/>'], 1.6)
    marks = '''
  <g id="hb-marks" fill="none" stroke-linecap="round">
    <path d="M89.5 95.5a6 5.6 0 1 1-3.4-3.6" stroke="#66748c" stroke-width="1.8"/>
    <path d="M51.6 104.6l3.2-4" stroke="#4e5966" stroke-width="1.7"/>
    <circle cx="78" cy="142" r="0.7" fill="#7f8fa0" stroke="none"/>
  </g>'''
    eye0 = eye(0, 46.8, 128.6, 7.8, 9.4, 16, '#0e0b17', '#1d172c',
               '<ellipse cx="46.5" cy="128.5" rx="4.2" ry="5.4" fill="#29234f" transform="rotate(18 46.5 128.5)"/>'
               '<circle cx="45.4" cy="126.6" r="1.3" fill="#544c9a"/><circle cx="49.5" cy="133.5" r="0.7" fill="#8a7d9e"/>')
    eye1 = eye(1, 120, 127.8, 9.2, 10.4, 0, '#0b0f1a', '#1b2539',
               '<ellipse cx="120.6" cy="129.2" rx="6.8" ry="7.4" fill="#05060b"/>'
               '<path d="M114 124.5c3-3.2 9.5-3.6 13.4-0.4" fill="none" stroke="#7b6764" stroke-width="1.9" stroke-linecap="round"/>'
               '<circle cx="117" cy="125.8" r="0.9" fill="#c9b6ae"/>')
    return skin + horn + marks + f'''
  <g id="hb-eyes">{eye0}{eye1}
  </g>'''
