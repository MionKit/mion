# Builds a mion from its crop: traced flat body tones and line work, eyes rebuilt as clean shapes, a gloss streak and a ground shadow.
# Run from this folder: python3 trace_mion.py <name>, with the settings for <name> in mions.json ('back' and 'extra' hold hand-drawn parts behind and in front,
# 'parts' names a module whose back() and extra() build them in code; 'trace': false skips the tracing for a mion built fully by hand).
import sys, json, importlib, re, cv2, numpy as np
from common import *

name = sys.argv[1]
cfg = json.load(open('mions.json'))[name]
parts = importlib.import_module(cfg['parts']) if cfg.get('parts') else None
back = cfg.get('back', '') + (parts.back() if hasattr(parts, 'back') else '')
extra = cfg.get('extra', '') + (parts.extra() if hasattr(parts, 'extra') else '')
img, soft = load(f'{name}.png')
h, w = img.shape[:2]

if not cfg.get('trace', True):  # built fully by hand: only the crop's size and the given ground shadow
    sx, ground, srx = cfg['shadow']
    shadow = f'<ellipse cx="{sx}" cy="{ground}" rx="{srx}" ry="{max(4, srx * 0.2):.0f}" fill="#000" opacity="0.32" filter="url(#{name}-blur)"/>'
    layers, ink, gloss, eye_svg = [], None, '', ''
else:
    body = cutout(img, keep=cfg.get('keep'), drop=cfg.get('drop'))
    eyes = find_eyes(soft, body, cfg.get('eye_min', 4)) if cfg.get('eyes', True) else []
    eye_area = np.zeros(body.shape, bool)
    for white, _ in eyes: eye_area |= cv2.dilate(white.astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    ink = find_ink(soft, body & ~eye_area, cfg.get('ink', 26))
    labels, colors = flatten(soft, body, cfg.get('tones', 6), paint_over=ink | eye_area)
    layers = stacked(labels, colors, cfg.get('tones', 6))

    ys, xs = np.where(body)
    top, bottom = ys.min(), ys.max()

    # ground shadow under the lowest part of the body: one soft patch, so the scene can keep it still while the mion bobs
    foot = xs[ys > bottom - (bottom - top) * 0.12]
    sx, sw = (foot.min() + foot.max()) / 2 / UP, (foot.max() - foot.min()) / UP
    ground = cfg.get('ground', bottom / UP - 3)   # set it for mions on legs, whose feet the tracer cannot see
    shadow = f'<ellipse cx="{sx:.0f}" cy="{ground:.0f}" rx="{sw * 0.62:.0f}" ry="{max(4, sw * 0.12):.0f}" fill="#000" opacity="0.32" filter="url(#{name}-blur)"/>'

    # gloss: a light streak just inside the lit left edge of the upper body
    rows = np.arange(int(top + (bottom - top) * cfg.get('gloss_from', 0.12)), int(top + (bottom - top) * cfg.get('gloss_to', 0.45)), 4 * UP)
    edge = [(xs[ys == r].min() + 5 * UP, r) for r in rows if (ys == r).any()]
    runs, run = [], []
    for p in edge:  # the edge jumps where an ear or horn takes over as leftmost; keep the longest unbroken stretch
        if run and abs(p[0] - run[-1][0]) > 7 * UP: runs.append(run); run = []
        run.append(p)
    edge = max(runs + [run], key=len)
    gloss = f'<path id="gloss" d="M{" ".join(f"{x / UP:.0f} {y / UP:.0f}" for x, y in edge)}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>' if len(edge) >= 3 else ''

    # eyes: dark rim, white, and a pupil group (pupil plus shine) last, so the scene can move it and clip it to the white
    eye_svg = ''
    for i, (white, pupil) in enumerate(eyes):
        ring = (cv2.dilate(white.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0) & ~white
        rim_col = sample(img, ring & body) * 0.7
        py, px = np.where(pupil); pr = np.sqrt(pupil.sum() / np.pi) / UP
        shine_x, shine_y = px.mean() / UP - pr * 0.35, py.mean() / UP - pr * 0.4
        eye_svg += f'''
    <g id="eye-{i}">
      <path fill="{hexc(rim_col)}" d="{region_path(cv2.dilate(white.astype(np.uint8), np.ones((5, 5), np.uint8)), 2.5, 20, 10)}"/>
      <path fill="#f6f4f1" d="{region_path(white, 2.5, 20, 10)}"/>
      <g><path fill="{hexc(sample(img, pupil) * 0.8)}" d="{region_path(pupil, 2, 10, 8)}"/><circle cx="{shine_x:.1f}" cy="{shine_y:.1f}" r="{max(1.2, pr * 0.28):.1f}" fill="#fff"/></g>
    </g>'''

pad = max(14, int(ground - h // UP) + 14)
ink_svg = f'<path id="lines" fill="{hexc(sample(img, ink) * 0.85)}" d="{region_path(ink, 1.5, 10, 12)}"/>' if ink is not None and ink.any() else ''
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w // UP} {h // UP + pad}" width="{w // UP}" height="{h // UP + pad}">
  <defs><filter id="{name}-blur" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
  <g id="shadow">{shadow}</g>{back}''' + (f'''
  <g id="body">''' + ''.join(f'\n    <path fill="{c}" d="{d}"/>' for c, d in layers if d) + f'''
  </g>
  {ink_svg}
  {gloss}''' if layers else '') + (f'''
  <g id="eyes">{eye_svg}
  </g>''' if eye_svg else '') + f'''{extra}
</svg>
'''
# smaller file, same picture: no indentation, and short names for the shapes and clips every stacked part repeats
svg = re.sub(r'-clip\b', '-c', re.sub(r'-shape\b', '-s', re.sub(r'\n\s+<', '\n<', svg)))
open(f'../../creatures/{name}.svg', 'w').write(svg)
print(name, f'{len(svg) / 1024:.1f} KB')
