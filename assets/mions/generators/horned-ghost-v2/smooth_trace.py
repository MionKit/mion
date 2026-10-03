# Traces a flat-colour PNG into stacked, smoothed SVG layers: a base silhouette, then each tone on top.
import sys, cv2, numpy as np
KEEP = None
if '--keep' in sys.argv:  # only trace where this mask is white; colours and layer order still come from the whole image
    at = sys.argv.index('--keep'); KEEP = cv2.imread(sys.argv[at + 1], 0) > 0; del sys.argv[at:at + 2]
src, out, name = sys.argv[1], sys.argv[2], sys.argv[3]
SMOOTH, MIN_AREA, SCALE = 3, 30, 0.5   # contour blur in px, drop patches smaller than this, output scale
img = cv2.imread(src, cv2.IMREAD_UNCHANGED)
alpha = img[..., 3] > 0
cols = img[..., :3][alpha]
uniq, counts = np.unique(cols.reshape(-1, 3), axis=0, return_counts=True)
order = np.argsort(-counts)
hexc = lambda c: '#%02x%02x%02x' % (c[2], c[1], c[0])

def smooth_path(cnt, SMOOTH=SMOOTH):
    pts = cnt[:, 0, :].astype(np.float64)
    if len(pts) < 8: return ''
    k = np.exp(-0.5 * (np.arange(-3 * SMOOTH, 3 * SMOOTH + 1) / SMOOTH) ** 2); k /= k.sum()
    pad = len(k) // 2
    wrap = np.concatenate([pts[-pad:], pts, pts[:pad]])
    sm = np.stack([np.convolve(wrap[:, i], k, 'valid') for i in range(2)], 1)
    step = max(1, len(sm) // max(6, len(sm) // 10))   # about one anchor every 10 px
    p = sm[::step] * SCALE
    n = len(p)
    d = f'M{p[0][0]:.1f} {p[0][1]:.1f}'
    for i in range(n):   # Catmull-Rom through the anchors, written as cubic curves
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % n], p[(i + 2) % n]
        c1, c2 = p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6
        d += f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
    return d + 'Z'

def region_path(mask, smooth=SMOOTH):
    if KEEP is not None: mask = mask & KEEP
    cnts, hier = cv2.findContours(mask.astype(np.uint8) * 255, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = [smooth_path(c, smooth) for c in cnts if cv2.contourArea(c) >= MIN_AREA]
    return ''.join(p for p in parts if p)

# each layer also covers every tone drawn after it, so smoothing never opens a gap between patches
tones = [np.all(img[..., :3] == uniq[idx], -1) & alpha for idx in order]
layers, below = [], np.zeros_like(alpha)
for rank in range(len(order) - 1, -1, -1):
    below = below | tones[rank]
    m = cv2.morphologyEx(below.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    layers.append(('base' if rank == 0 else f'tone-{rank}', hexc(uniq[order[rank]]), region_path(m)))
layers.reverse()
if len(sys.argv) > 5:  # ink lines on top, one colour per line, taken from the original and darkened
    from sklearn.cluster import KMeans
    ink = cv2.imread(sys.argv[4], 0) > 0
    orig = cv2.imread(sys.argv[5])
    n, lab = cv2.connectedComponents(ink.astype(np.uint8))
    means = np.array([np.median(orig[lab == i], 0) for i in range(1, n)])
    km = KMeans(min(3, len(means)), n_init=6, random_state=1).fit(means)
    for k, c in enumerate(km.cluster_centers_):
        m = np.isin(lab, [i + 1 for i in np.where(km.labels_ == k)[0]])
        layers.append((f'ink-{k}', hexc((c * 0.8).astype(int)), region_path(m, 2)))
h, w = alpha.shape
body = ''.join(f'\n  <path id="{name}-{lid}" fill="{fill}" fill-rule="evenodd" d="{d}"/>' for lid, fill, d in layers if d)
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w * SCALE:.0f} {h * SCALE:.0f}" width="{w * SCALE:.0f}" height="{h * SCALE:.0f}">\n<g id="{name}">{body}\n</g>\n</svg>\n'
open(out, 'w').write(svg)
print(len(layers), 'layers,', len(svg) // 1024, 'KB')
