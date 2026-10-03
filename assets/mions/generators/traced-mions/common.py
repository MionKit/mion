# Shared tracing steps for creatures and the tree: cut out, flatten to a few tones, find dark lines and eyes, and write short smooth paths.
import cv2, numpy as np
from sklearn.cluster import KMeans

UP = 2   # everything is worked at 2x the crop and written back at 1x
hexc = lambda c: '#%02x%02x%02x' % (int(c[2]), int(c[1]), int(c[0]))
lighter = lambda c, f: np.clip(np.asarray(c, float) + (255 - np.asarray(c, float)) * f, 0, 255)


def load(src):
    img = cv2.resize(cv2.imread(src), None, fx=UP, fy=UP, interpolation=cv2.INTER_LANCZOS4)
    soft = img.copy()
    for _ in range(3): soft = cv2.bilateralFilter(soft, 9, 40, 9)
    return img, soft


def fill_holes(mask):
    m = mask.astype(np.uint8)
    return cv2.drawContours(np.zeros_like(m), cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], -1, 1, -1) > 0


def biggest(mask):
    n, comp, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    if n < 2: return np.zeros(mask.shape, bool)
    return fill_holes(comp == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]))


def polys_mask(shape, polys):  # polygons given in 1x crop units
    m = np.zeros(shape, np.uint8)
    for p in polys: cv2.fillPoly(m, [(np.array(p, float) * UP).astype(np.int32)], 1)
    return m > 0


def cutout(img, keep=None, drop=None, iters=6):
    """GrabCut seeded by the crop border: border colours are background, `keep` polygons are surely the creature, `drop` polygons surely not."""
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    border = np.concatenate([lab[:6].reshape(-1, 3), lab[-6:].reshape(-1, 3), lab[:, :6].reshape(-1, 3), lab[:, -6:].reshape(-1, 3)])
    bg_cols = KMeans(4, n_init=4, random_state=1).fit(border).cluster_centers_
    near_bg = np.min(np.linalg.norm(lab[:, :, None, :] - bg_cols[None, None], axis=3), axis=2) < 14
    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    mask[near_bg] = cv2.GC_PR_BGD
    mask[:4], mask[-4:], mask[:, :4], mask[:, -4:] = cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD
    if keep: mask[polys_mask((h, w), keep)] = cv2.GC_FGD
    if drop: mask[polys_mask((h, w), drop)] = cv2.GC_BGD
    bgm, fgm = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(img, mask, None, bgm, fgm, iters, cv2.GC_INIT_WITH_MASK)
    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    if drop: fg[polys_mask((h, w), drop)] = 0
    return biggest(fg)


def find_ink(soft, inside, thr=26, min_area=14):
    """Line work: pixels much darker than their surroundings."""
    gray = cv2.cvtColor(soft, cv2.COLOR_BGR2GRAY)
    hat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    ink = ((hat > thr) | (gray < 60)) & cv2.erode(inside.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    n, comp, stats, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8))
    return np.isin(comp, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= min_area * UP * UP])


def find_eyes(soft, inside, min_r=4):
    """Eyes: bright, nearly colourless blobs holding a dark blob. Returns a list of (white mask, pupil mask)."""
    lab = cv2.cvtColor(soft, cv2.COLOR_BGR2LAB).astype(np.float32)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    white = (lab[..., 0] > 200) & (chroma < 14) & inside
    white = cv2.morphologyEx(white.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    dark = (lab[..., 0] < 115) & inside   # pupils are soft dark greys, not black
    n, comp, stats, _ = cv2.connectedComponentsWithStats(white)
    eyes = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < (min_r * UP) ** 2 * 2: continue
        blob = fill_holes(comp == i)
        hull = cv2.drawContours(np.zeros(blob.shape, np.uint8), [cv2.convexHull(np.column_stack(np.where(blob))[:, ::-1])], -1, 1, -1) > 0
        pupil = biggest(dark & hull)
        if pupil.sum() < (min_r * UP) ** 2 * 0.4: continue
        eyes.append((fill_holes(hull | pupil), pupil))
    return eyes


def flatten(soft, inside, K, paint_over=None, blur=13):
    """K flat tones by k-means in Lab, then a majority filter so patches come out as calm blobs."""
    src = soft if paint_over is None else cv2.inpaint(soft, cv2.dilate(paint_over.astype(np.uint8), np.ones((5, 5), np.uint8)), 6, cv2.INPAINT_TELEA)
    pix = cv2.cvtColor(src, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    km = KMeans(K, n_init=6, random_state=1).fit(pix[inside.reshape(-1)])
    labels = np.full(inside.size, K, np.int32); labels[inside.reshape(-1)] = km.labels_; labels = labels.reshape(inside.shape)
    for _ in range(3):
        labels = np.stack([cv2.blur((labels == k).astype(np.float32), (blur, blur)) for k in range(K + 1)]).argmax(0)
    labels[~inside] = K
    return labels, cv2.cvtColor(km.cluster_centers_.astype(np.uint8)[None], cv2.COLOR_LAB2BGR)[0]


def compact(start, curves, digits=0):
    """Rounded numbers, relative moves, no spaces before minus signs: the shortest path text. Small shapes need digits=1 to stay smooth."""
    q = 10 ** digits
    snap = lambda v: np.round(np.asarray(v, float) * q).astype(int)
    num = lambda v: str(v) if digits == 0 else (f'{v / q:.{digits}f}'.rstrip('0').rstrip('.') or '0')
    at = snap(start); d = f'M{num(at[0])} {num(at[1])}c'
    for c1, c2, end in curves:
        c1, c2, end = (snap(v) for v in (c1, c2, end))
        d += ' '.join(num(v) for v in (*(c1 - at), *(c2 - at), *(end - at))) + ' '
        at = end
    return d.rstrip().replace(' -', '-') + 'z'


def through(points, closed=True, digits=0):
    """Catmull-Rom through points (1x units), as a compact path; keeps every bend round."""
    p = np.asarray(points, float); n = len(p)
    curves = []
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = p[i - 1 if closed or i else 0], p[i], p[(i + 1) % n], p[(i + 2) % n if closed or i + 2 < n else n - 1]
        curves.append((p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6, p2))
    d = compact(p[0], curves, digits)
    return d if closed else d[:-1]


def smooth_path(cnt, sigma=3.5, anchor=20):
    pts = cnt[:, 0, :].astype(np.float64)
    if len(pts) < 8: return ''
    k = np.exp(-0.5 * (np.arange(-3 * sigma, 3 * sigma + 1) / sigma) ** 2); k /= k.sum(); pad = len(k) // 2
    wrap = np.concatenate([pts[-pad:], pts, pts[:pad]])
    sm = np.stack([np.convolve(wrap[:, i], k, 'valid') for i in range(2)], 1)
    return through(sm[::max(1, len(sm) // max(5, len(sm) // anchor))] / UP)


def region_path(mask, sigma=3.5, min_area=60, anchor=20):
    cnts = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)[0]
    return ''.join(smooth_path(c, sigma, anchor) for c in cnts if cv2.contourArea(c) >= min_area)


def stacked(labels, colors, K):
    """Tone layers, biggest first; each layer also covers every tone drawn after it, so no gaps open between patches."""
    order = np.argsort([-(labels == k).sum() for k in range(K)])
    layers, below = [], np.zeros(labels.shape, bool)
    for rank in range(K - 1, -1, -1):
        below |= labels == order[rank]
        m = cv2.morphologyEx(below.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        layers.append((hexc(colors[order[rank]]), region_path(m)))
    return layers[::-1]


def sample(soft, mask):
    return np.median(soft[mask], 0) if mask.any() else np.array([128, 128, 128])


def wobbly(cx, cy, rx, ry, tilt=0, waves=(), n=14, box=2):
    """An ellipse with a few slow bumps, as a compact path: the base shape of every stacked part.
    box above 2 squares it off toward a rounded rectangle (3 is a gentle step)."""
    t = np.radians(tilt); cs, sn = np.cos(t), np.sin(t); pts = []
    for j in range(n):
        a = 2 * np.pi * j / n
        k = 1 + sum(amp * np.sin(f * a + ph) for f, amp, ph in waves)
        c, s = np.cos(a), np.sin(a)
        x, y = rx * k * np.sign(c) * abs(c) ** (2 / box), ry * k * np.sign(s) * abs(s) ** (2 / box)
        pts.append((cx + x * cs - y * sn, cy + x * sn + y * cs))
    return through(pts, digits=1)


def cone(cx, cy, top, bottom, h, tilt=0, rand=None, round_by=0.3):
    """A cone section: a trapezoid `top` wide narrowing to `bottom`, `h` tall, corners rounded and slightly uneven. Returns a stack part."""
    j = (lambda: rand.uniform(-1.2, 1.2)) if rand else (lambda: 0)
    local = [(-top / 2 + j(), -h / 2 + j()), (top / 2 + j(), -h / 2 + j()), (bottom / 2 + j(), h / 2 + j()), (-bottom / 2 + j(), h / 2 + j())]
    t = np.radians(tilt); cs, sn = np.cos(t), np.sin(t)
    pts = [np.array([cx + x * cs - y * sn, cy + x * sn + y * cs]) for x, y in local]
    curves, n = [], len(pts)
    cuts = [(p + (pts[i - 1] - p) * round_by, p, p + (pts[(i + 1) % n] - p) * round_by) for i, p in enumerate(pts)]
    for i, (a, q, b) in enumerate(cuts):  # bend through each corner, then run straight to the next one
        na = cuts[(i + 1) % n][0]
        curves.append((a + (q - a) * 0.66, b + (q - b) * 0.66, b))
        curves.append((b + (na - b) / 3, b + (na - b) * 2 / 3, na))
    return dict(d=compact(cuts[0][0], curves), cx=cx, cy=cy, rx=(top + bottom) / 4, ry=h / 2, tilt=tilt)


def shade(color, f):
    """A hex colour moved toward white (f > 0) or black (f < 0)."""
    c = np.array([int(color[i:i + 2], 16) for i in (1, 3, 5)], float)
    c = c + (255 - c) * f if f > 0 else c * (1 + f)
    return '#' + ''.join(f'{int(round(v)):02x}' for v in np.clip(c, 0, 255))


def stack(name, parts, base, light, crease, shine, rand, vary=0):
    """Uneven parts stacked from the first to the last, each with a crease where it sits on the one before, a lighter patch and maybe a shine.
    parts: (cx, cy, rx, ry, tilt) in drawing order, with an optional sixth value to square a part off (see wobbly), or a shape from cone().
    vary gives each part its own slightly lighter or darker take on the colours."""
    out = f'\n  <g id="{name}">'
    centers = [(p['cx'], p['cy']) if isinstance(p, dict) else p[:2] for p in parts]
    for i, part in enumerate(parts):
        if isinstance(part, dict):
            d, cx, cy, rx, ry, tilt = part['d'], part['cx'], part['cy'], part['rx'], part['ry'], part['tilt']
        else:
            cx, cy, rx, ry, tilt, *box = part
            waves = [(k, rand.uniform(0.02, 0.06) / k ** 0.5, rand.uniform(0, 6.28)) for k in (2, 3)]
            d = wobbly(cx, cy, rx, ry, tilt, waves, box=box[0] if box else 2)
        if i:  # the crease falls toward the part below
            px, py = centers[i - 1]; dist = np.hypot(px - cx, py - cy) or 1
            dx, dy = (px - cx) / dist * 2.5, (py - cy) / dist * 2.5
        else:
            dx, dy = 1, 2.5
        tint = rand.uniform(-vary, vary) if vary else 0
        part_base, part_light = shade(base, tint), shade(light, tint)
        sx, sy = cx - rx * rand.uniform(0.25, 0.45), cy - ry * rand.uniform(0.3, 0.5)
        gleam = f'<ellipse cx="{sx:.1f}" cy="{sy:.1f}" rx="{rx * 0.28:.1f}" ry="{ry * 0.16:.1f}" fill="{shine}" transform="rotate({tilt - 25:.0f} {sx:.1f} {sy:.1f})"/>' if rand.random() < 0.75 else ''
        out += f'''
    <g id="{name}-{i}">
      <defs><path id="{name}-{i}-shape" d="{d}"/><clipPath id="{name}-{i}-clip"><use href="#{name}-{i}-shape"/></clipPath></defs>
      <use href="#{name}-{i}-shape" fill="{crease}" transform="translate({dx:.1f} {dy:.1f})"/>
      <use href="#{name}-{i}-shape" fill="{part_base}"/>
      <g clip-path="url(#{name}-{i}-clip)"><use href="#{name}-{i}-shape" fill="{part_light}" transform="matrix(.78 0 0 .78 {cx * 0.22 - rx * 0.12:.1f} {cy * 0.22 - ry * 0.15:.1f})"/>{gleam}</g>
    </g>'''
    return out + '\n  </g>'
