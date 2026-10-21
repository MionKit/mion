# Rebuilds the silhouette with one smooth curve along the bottom, from the first leg tip to the tail start.
import cv2, numpy as np, json
cut = cv2.imread('ghost-cut.png', cv2.IMREAD_UNCHANGED); a = (cut[..., 3] > 0).astype(np.uint8)
pts = max(cv2.findContours(a, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=len)[:, 0, :] / 2
LEG_TIP, TAIL_START, BACK = 848, 1476, 1668   # BACK: where the back line picks up again past the old tail
flap = next(i for i in range(400, LEG_TIP) if pts[i][1] > 198 and pts[i][0] < 60)   # where the old flap begins
bottom = pts[LEG_TIP:TAIL_START + 1]
hull = cv2.convexHull(bottom.astype(np.float32), returnPoints=False)[:, 0]
# keep the hull corners that sit on the underside, in walking order: these are the foot tips
tips = sorted(int(i) for i in hull)
tips = [i for i in tips if i in (0, len(bottom) - 1) or bottom[i][1] > np.interp(bottom[i][0], [bottom[-1][0], bottom[0][0]], [bottom[-1][1], bottom[0][1]])]
anchors = bottom[tips]
keep = [anchors[0]]
for p in anchors[1:]:   # drop corners closer than 12 px, they are the same foot
    if np.hypot(*(p - keep[-1])) > 12: keep.append(p)
if not np.allclose(keep[-1], anchors[-1]): keep.append(anchors[-1])
keep = np.array(keep)
print('curve through', [tuple(map(float, p)) for p in keep])
# Catmull-Rom through the tips, sampled densely so it joins the traced outline as plain points
ends = np.vstack([keep[0] * 2 - keep[1], keep, keep[-1] * 2 - keep[-2]])
curve = []
for i in range(1, len(ends) - 2):
    p0, p1, p2, p3 = ends[i - 1:i + 3]
    for t in np.linspace(0, 1, 14, endpoint=False):
        curve.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
outline = np.vstack([pts[BACK:], pts[:flap], pts[748:LEG_TIP], np.array(curve)])
sigma = 1.5
k = np.exp(-0.5 * (np.arange(-4, 5) / sigma) ** 2); k /= k.sum()
wrap = np.concatenate([outline[-4:], outline, outline[:4]])
sm = np.stack([np.convolve(wrap[:, i], k, 'valid') for i in range(2)], 1)[::3]
d = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in sm) + 'Z'
json.dump({'silhouette': d}, open('body-outline.json', 'w'))
print(len(sm), 'points')
