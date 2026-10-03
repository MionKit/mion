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


def compact(start, curves):
    """Whole numbers, relative moves, no spaces before minus signs: the shortest path text."""
    at = np.round(start).astype(int); d = f'M{at[0]} {at[1]}c'
    for c1, c2, end in curves:
        c1, c2, end = (np.round(v).astype(int) for v in (c1, c2, end))
        d += ' '.join(str(v) for v in (*(c1 - at), *(c2 - at), *(end - at))) + ' '
        at = end
    return d.rstrip().replace(' -', '-') + 'z'


def through(points, closed=True):
    """Catmull-Rom through points (1x units), as a compact path; keeps every bend round."""
    p = np.asarray(points, float); n = len(p)
    curves = []
    for i in range(n if closed else n - 1):
        p0, p1, p2, p3 = p[i - 1 if closed or i else 0], p[i], p[(i + 1) % n], p[(i + 2) % n if closed or i + 2 < n else n - 1]
        curves.append((p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6, p2))
    d = compact(p[0], curves)
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
