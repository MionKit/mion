# The crawler mion, built by hand: head and long body as one silhouette, a pale face lobe, three cone legs, three eyes.
import random, re
import numpy as np
from common import cone, wobbly, through

rand = random.Random(17)
bumps = lambda size, rand=rand: [(k, rand.uniform(0.01, size) / k ** 0.5, rand.uniform(0, 6.28)) for k in (2, 3, 4)]

def whole(d):  # a wobbly path redrawn through its own points in whole pixels: big shapes need no decimals
    nums = [float(v) for v in re.findall(r'-?[\d.]+', d)]
    pts = [(nums[0], nums[1])]
    for i in range(2, len(nums) - 6, 6): pts.append((pts[-1][0] + nums[i + 4], pts[-1][1] + nums[i + 5]))
    return through(pts)

def lump(cx, cy, rx, ry, tilt=0, own=rand, size=0.05, n=12):  # a big lumpy oval in whole pixels
    return whole(wobbly(cx, cy, rx, ry, tilt, bumps(size, own), n))

def uneven(points, own):  # a big shape through hand-measured points, a little uneven
    return through([(x + own.uniform(-1, 1), y + own.uniform(-1, 1)) for x, y in points])

def blob(name, d, base, line, push, tones, shine='', width=2):
    # the dark copy under the base shows as a thin outline, thicker toward `push`
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{d}"/><clipPath id="{name}-clip"><use href="#{name}-shape"/></clipPath></defs>
    <use href="#{name}-shape" fill="{line}" stroke="{line}" stroke-width="{width}" stroke-linejoin="round" transform="translate({push[0]} {push[1]})"/>
    <use href="#{name}-shape" fill="{base}"/>
    <g clip-path="url(#{name}-clip)">''' + ''.join(f'\n      <path d="{t}" fill="{c}"/>' for c, t in tones) + shine + '''
    </g>
  </g>'''

def leg(name, x, y, top, bottom, h, tilt, base, light, line):  # one cone, wide where it leaves the body, splayed by tilt, a slimmer lit cone along its lower left
    shape = cone(x, y, top, bottom, h, tilt, rand, 0.42)['d']
    t = np.radians(tilt)
    lit = cone(x - 2 * np.cos(t), y + 2 * np.sin(t) + 1, top * 0.55, bottom * 0.6, h - 6, tilt, None, 0.42)['d']
    return f'''
  <g id="{name}">
    <defs><path id="{name}-shape" d="{shape}"/></defs>
    <use href="#{name}-shape" fill="{line}" stroke="{line}" stroke-width="2" stroke-linejoin="round" transform="translate(0.8 1.2)"/>
    <use href="#{name}-shape" fill="{base}"/>
    <path d="{lit}" fill="{light}"/>
  </g>'''

def back():  # the far front leg hangs from under the head
    return leg('cr-leg-far', 66, 137, 15, 9, 34, 4, '#8c8fa8', '#a3a6bd', '#55566c')

def eye(i, x, y, rx, ry, tilt, rim, white, pupil, iris):
    # the rim is the white pushed down-right, so it shows only as a lower-right crescent
    b = bumps(0.04)
    px, py, prx, pry, ptilt = pupil
    ix, iy = px + prx * 0.18, py + pry * 0.2
    return f'''
    <g id="eye-{i}">
      <path fill="{rim}" d="{wobbly(x + 1.5, y + 2, rx + 2, ry + 2, tilt, b, 12)}"/>
      <path fill="{white}" d="{wobbly(x, y, rx, ry, tilt, b, 12)}"/>
      <g><ellipse cx="{px}" cy="{py}" rx="{prx}" ry="{pry}" fill="#253041" transform="rotate({ptilt} {px} {py})"/><ellipse cx="{ix:.1f}" cy="{iy:.1f}" rx="{prx * 0.62:.1f}" ry="{pry * 0.6:.1f}" fill="{iris}" transform="rotate({ptilt} {ix:.1f} {iy:.1f})"/><circle cx="{px - prx * 0.38:.1f}" cy="{py - pry * 0.42:.1f}" r="{max(1.1, prx * 0.17):.1f}" fill="#fff"/></g>
    </g>'''

def ring(x, y, rx, ry, tilt):  # a grey band inside the big eye's lower right, kept still in front of the pupil
    t, a = np.radians(tilt), np.radians(np.linspace(-20, 120, 5))
    pts = [(x + u * np.cos(t) - v * np.sin(t), y + u * np.sin(t) + v * np.cos(t)) for u, v in zip((rx - 2.8) * np.cos(a), (ry - 2.8) * np.sin(a))]
    return f'''
  <path id="cr-ring" d="{through(pts, closed=False, digits=1)}" fill="none" stroke="#a9abb6" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/>'''

def extra():
    own = random.Random(171)   # the silhouette and its tones take their own stream, so they never shift when a small part changes
    # head and body as one outline: the head's underside runs on into the body, a small notch between their tops
    body_pts = [(48, 33), (63, 31), (79, 35), (93, 43), (101, 51), (106, 60), (113, 61), (122, 53), (136, 41), (156, 32), (180, 28), (205, 29), (226, 35),
                (241, 46), (251, 62), (255, 82), (253, 100), (247, 113), (236, 123), (220, 132), (200, 141), (180, 146), (155, 147), (130, 146),
                (105, 140), (82, 131), (62, 124), (45, 114), (32, 101), (25, 85), (23, 68), (27, 51), (35, 40)]
    body = blob('cr-body', uneven(body_pts, own), '#8a8daa', '#4f5068', (0.6, 1.6), [
        ('#a9acc1', lump(162, 86, 104, 50, 2, own, 0.04)),
        ('#a9acc1', lump(62, 77, 42, 40, 0, own, 0.04)),
        ('#d8d7dc', lump(190, 78, 70, 46, 4, own, 0.04)),
        ('#dcdce1', lump(65, 64, 43, 38, -6, own, 0.04)),
        ('#f4f2f0', lump(200, 62, 56, 37, 6, own, 0.05)),
        ('#f4f2f0', lump(224, 90, 27, 24, 0, own, 0.05)),
        ('#f7f6f5', lump(67, 58, 41, 32, -8, own, 0.05)),
        ('#f4f2f0', lump(150, 52, 26, 18, -10, own, 0.05, 10)),
        ('#d4d2d6', lump(165, 90, 21, 30, 15, own, 0.06, 10)),
        ('#e6d2c8', lump(156, 45, 13, 10, -8, own, 0.06, 10))],
        '\n      <ellipse cx="192" cy="38" rx="14" ry="3.5" fill="#ffffff" transform="rotate(4 192 38)"/>')
    legs = (leg('cr-leg-near', 117, 155, 30, 8, 58, 58, '#8a8daa', '#a4a8c8', '#45455e')
            + leg('cr-leg-back', 199, 146, 22, 8, 38, 54, '#8a8daa', '#a4a8c8', '#45455e'))
    lobe_pts = [(108, 58), (122, 55), (136, 59), (144, 68), (144, 84), (140, 100), (134, 110), (125, 116), (114, 115), (106, 108), (103, 100), (100, 85), (101, 70)]
    lobe = blob('cr-lobe', uneven(lobe_pts, own), '#e0e2e8', '#6a6b80', (0.6, 1.2), [('#eceef2', lump(119, 82, 22, 28, -5, own, 0.04))], width=1.2)
    spots = f'''
  <g id="cr-spots">
    <path fill="#e8c9cd" d="{wobbly(83, 69, 4.5, 5.5, -10, bumps(0.06), n=8)}"/>
    <path fill="#e4c6cc" d="{wobbly(68, 86, 4, 2.6, 20, bumps(0.06), n=8)}"/>
    <path d="M65.5 85Q67 88.5 70.5 88" fill="none" stroke="#b68d97" stroke-width="1" stroke-linecap="round"/>
    <ellipse cx="228" cy="104" rx="2.6" ry="2" fill="#c98ea3"/>
    <ellipse cx="205" cy="59" rx="3.2" ry="2.2" fill="#c6c0d3"/>
    <circle cx="198" cy="131" r="1.1" fill="#4b4a5e"/>
  </g>'''
    return body + legs + lobe + spots + f'''
  <g id="cr-eyes">{eye(0, 47.5, 57, 21, 18.5, -12, '#5d5f72', '#f4f3f2', (45, 51.5, 15.5, 12.5, -15), '#323e53')}{eye(1, 121, 83, 19, 20, -5, '#a9abb8', '#f3f4f5', (121, 83, 15, 14.5, 0), '#335660')}{eye(2, 199, 87, 15, 13, -5, '#9a9cab', '#f1f1f2', (198.5, 87, 11.5, 10, 0), '#3d5064')}
  </g>{ring(47.5, 57, 21, 18.5, -12)}'''
