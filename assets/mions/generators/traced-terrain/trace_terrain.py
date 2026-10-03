# Builds a terrain piece from the reference: a clean hand-drawn tile measured from the cutout, the traced cone on it, its ink lines and a gloss streak.
import sys, math, cv2, numpy as np
from sklearn.cluster import KMeans
src, out, name, K = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
UP, SMOOTH, MIN_AREA, ANCHOR = 2, 3.5, 60, 20   # work at 2x, contour blur in px, drop patches smaller than this, px between curve points

img = cv2.resize(cv2.imread(src), None, fx=UP, fy=UP, interpolation=cv2.INTER_LANCZOS4)
soft = img.copy()
for _ in range(3): soft = cv2.bilateralFilter(soft, 9, 40, 9)
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
hexc = lambda c: '#%02x%02x%02x' % (int(c[2]), int(c[1]), int(c[0]))

def biggest(mask):
    n, comp, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    if n < 2: return np.zeros(mask.shape, bool)
    one = (comp == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    return cv2.drawContours(np.zeros_like(one), cv2.findContours(one, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], -1, 1, -1) > 0

# cut out: anything far enough from the sky colour, biggest blob, holes filled
sky = np.median(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]), 0)
fg = cv2.morphologyEx((np.linalg.norm(lab - sky, axis=2) > 30).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
fg = biggest(fg)
ys, xs = np.where(fg)

# tile: left, right and bottom corners; the top face is a 2:1 diamond like the island, so its depth gives the thickness
ISO, MIN_THICK = 0.5, 8
def corner(sel):
    i = sel(xs); return np.array([xs[i], ys[xs == xs[i]].mean()])
L, R = corner(np.argmin), corner(np.argmax)
B = np.array([xs[np.argmax(ys)], ys.max()])
t = max(MIN_THICK * UP, B[1] - ((L[1] + R[1]) / 2 + (R[0] - L[0]) / 2 * ISO))
Bf = B - [0, t]                 # front corner of the top face
sample = lambda p: np.median(soft[int(p[1]) - 3:int(p[1]) + 4, int(p[0]) - 3:int(p[0]) + 4].reshape(-1, 3), 0)
top_col = sample(Bf + 0.18 * (L + R - 2 * Bf))
T = L + R - Bf                  # back corner: the top face is a parallelogram
left_col = sample((L + Bf) / 2 + [0, t / 2])
right_col = sample((R + Bf) / 2 + [0, t / 2])

def rounded(pts, k=0.18):  # polygon with every corner cut back along both edges and bent through, so nothing is sharp
    pts = [np.asarray(p, float) / UP for p in pts]; d = ''
    for i, cur in enumerate(pts):
        a, b = cur + (pts[i - 1] - cur) * k, cur + (pts[(i + 1) % len(pts)] - cur) * k
        a, b, q = (np.round(v).astype(int) for v in (a, b, cur))
        d += (f'M{a[0]} {a[1]}' if i == 0 else f'L{a[0]} {a[1]}') + f'Q{q[0]} {q[1]} {b[0]} {b[1]}'
    return d + 'Z'
down = np.array([0, t])
tile_shape = rounded([T, R, R + down, B, L + down, L], 0.12)
right_face = rounded([Bf, R, R + down, B], 0.12)
top_face = rounded([T, R, Bf, L], 0.12)
inset_c = (T + R + Bf + L) / 4
top_inset = rounded([inset_c + (p - inset_c) * 0.86 + [-2 * UP, -2 * UP] for p in (T, R, Bf, L)], 0.16)
lighter = lambda c, f: np.clip(c + (255 - c) * f, 0, 255)

# cone: what sits off the tile, or on the top face but far from its colour
tile_poly = np.zeros(fg.shape, np.uint8)
cv2.fillPoly(tile_poly, [np.array([T, R, R + down, B, L + down, L], np.int32)], 1)
off_top = np.linalg.norm(lab - cv2.cvtColor(top_col.astype(np.uint8)[None, None], cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32), axis=2) > 22
cone = fg & ((tile_poly == 0) | off_top) & (np.arange(fg.shape[0])[:, None] < Bf[1])
cone = biggest(cv2.morphologyEx(cone.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)))
cy, cx = np.where(cone)

# ink: pixels much darker than their surroundings, inside the cone
gray = cv2.cvtColor(soft, cv2.COLOR_BGR2GRAY)
hat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
ink = (hat > 18) & cv2.erode(cone.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
n, comp, stats, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8))
ink = np.isin(comp, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 12])
ink_col = np.median(img[ink], 0) * 0.85 if ink.any() else None

# flatten the cone, ink painted over so tones run underneath it
paint = cv2.inpaint(soft, cv2.dilate(ink.astype(np.uint8), np.ones((5, 5), np.uint8)), 6, cv2.INPAINT_TELEA)
pix = cv2.cvtColor(paint, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
km = KMeans(K, n_init=6, random_state=1).fit(pix[cone.reshape(-1)])
labels = np.full(cone.size, K, np.int32); labels[cone.reshape(-1)] = km.labels_; labels = labels.reshape(cone.shape)
for _ in range(3):
    labels = np.stack([cv2.blur((labels == k).astype(np.float32), (13, 13)) for k in range(K + 1)]).argmax(0)
labels[~cone] = K
colors = cv2.cvtColor(km.cluster_centers_.astype(np.uint8)[None], cv2.COLOR_LAB2BGR)[0]

def smooth_path(cnt, sigma=SMOOTH):
    pts = cnt[:, 0, :].astype(np.float64)
    if len(pts) < 8: return ''
    k = np.exp(-0.5 * (np.arange(-3 * sigma, 3 * sigma + 1) / sigma) ** 2); k /= k.sum(); pad = len(k) // 2
    wrap = np.concatenate([pts[-pad:], pts, pts[:pad]])
    sm = np.stack([np.convolve(wrap[:, i], k, 'valid') for i in range(2)], 1)
    p = sm[::max(1, len(sm) // max(5, len(sm) // ANCHOR))] / UP
    curves = []
    for i in range(len(p)):   # Catmull-Rom through the anchors keeps every edge round
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % len(p)], p[(i + 2) % len(p)]
        curves.append((p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6, p2))
    return compact(p[0], curves)

def compact(start, curves):  # whole numbers, relative moves, no spaces before minus signs: the shortest path text
    at = np.round(start).astype(int); d = f'M{at[0]} {at[1]}c'
    for c1, c2, end in curves:
        c1, c2, end = (np.round(v).astype(int) for v in (c1, c2, end))
        d += ' '.join(str(v) for v in (*(c1 - at), *(c2 - at), *(end - at))) + ' '
        at = end
    return d.rstrip().replace(' -', '-') + 'z'
def region_path(mask, sigma=SMOOTH, min_area=MIN_AREA):
    cnts = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)[0]
    return ''.join(smooth_path(c, sigma) for c in cnts if cv2.contourArea(c) >= min_area)

# cone tones stacked: biggest first, each layer also covering every tone drawn after it, so no gaps open
order = np.argsort([-(labels == k).sum() for k in range(K)])
cone_layers, below = [], np.zeros(cone.shape, bool)
for rank in range(K - 1, -1, -1):
    below |= labels == order[rank]
    m = cv2.morphologyEx(below.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cone_layers.append((rank, hexc(colors[order[rank]]), region_path(m)))
cone_layers.reverse()

# contact shadow: the cone's base, a little wider and lower, in a darker tile colour
base_y = cy.max(); base_xs = cx[cy > base_y - 6 * UP]
base_c = np.array([base_xs.mean(), base_y - 2 * UP]) / UP
base_rx, base_ry = (base_xs.max() - base_xs.min()) / UP / 2 * 1.12, t / UP * 0.9

# gloss: a streak just inside the cone's lit left edge, over the mid tones where white still shows
core = cv2.morphologyEx(cone.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (16 * UP, 16 * UP))) > 0   # the cone without its spread-out foot
ky, kx = np.where(core) if core.any() else (cy, cx)
tip_y = ky.min(); height = ky.max() - tip_y
rows = np.arange(int(tip_y + height * 0.25), int(min(tip_y + height * 0.8, (L[1] + R[1]) / 2 - 4 * UP)), 4 * UP)   # stay above the tile's side corners
edge = np.array([[kx[ky == r].min() + 3.5 * UP, r] for r in rows if (ky == r).any()]) / UP
gloss = ''
if len(edge) >= 3:
    kk = np.ones(3) / 3; ex = np.convolve(np.pad(edge[:, 0], 1, mode='edge'), kk, 'valid')
    gloss = 'M' + ' '.join(f'{x:.0f} {y:.0f}' for x, y in zip(ex, edge[:, 1]))

h, w = fg.shape
ink_el = f'\n    <path id="{name}-ink" fill="{hexc(ink_col)}" d="{region_path(ink, 1.5, 10)}"/>' if ink_col is not None else ''
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w // UP} {h // UP}" width="{w // UP}" height="{h // UP}">
  <defs><clipPath id="{name}-top-clip"><path d="{top_face}"/></clipPath></defs>
  <g id="{name}">
  <g id="{name}-tile">
    <path fill="{hexc(left_col)}" d="{tile_shape}"/>
    <path fill="{hexc(right_col)}" d="{right_face}"/>
    <path fill="{hexc(top_col)}" d="{top_face}"/>
    <path fill="{hexc(lighter(top_col, 0.12))}" d="{top_inset}" clip-path="url(#{name}-top-clip)"/>
  </g>
  <g id="{name}-cone">
    <ellipse id="{name}-contact" cx="{base_c[0]:.1f}" cy="{base_c[1]:.1f}" rx="{base_rx:.1f}" ry="{base_ry:.1f}" fill="{hexc(top_col * 0.78)}"/>''' + ''.join(
    f'\n    <path id="{name}-tone-{r}" fill="{c}" d="{d}"/>' for r, c, d in cone_layers if d) + ink_el + f'''
    <path id="{name}-gloss" d="{gloss}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
  </g>
  </g>
</svg>
'''
open(out, 'w').write(svg)
print(name, f'tile L{L / UP} R{R / UP} B{B / UP} t{t / UP:.1f}', 'ink' if ink_col is not None else 'no ink', len(svg) // 1024, 'KB')
