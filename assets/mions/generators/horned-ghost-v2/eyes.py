# Pulls each eye out of the cutout as three smooth shapes: dark outline, white, pupil (1x crop units).
import cv2, numpy as np, json
cut = cv2.imread('ghost-cut.png', cv2.IMREAD_UNCHANGED)
gray = cv2.cvtColor(cv2.bilateralFilter(cut[..., :3], 7, 30, 7), cv2.COLOR_BGR2GRAY)
ink = cv2.imread('ghost-ink.png', 0) > 0

def smooth(cnt, sigma=2.0, every=6):
    pts = cnt[:, 0, :].astype(np.float64)
    k = np.exp(-0.5 * (np.arange(-3 * sigma, 3 * sigma + 1) / sigma) ** 2); k /= k.sum(); pad = len(k) // 2
    wrap = np.concatenate([pts[-pad:], pts, pts[:pad]])
    sm = np.stack([np.convolve(wrap[:, i], k, 'valid') for i in range(2)], 1)
    p = sm[::max(1, len(sm) // max(8, len(sm) // every))] / 2; n = len(p)
    d = f'M{p[0][0]:.1f} {p[0][1]:.1f}'
    for i in range(n):
        p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % n], p[(i + 2) % n]
        c1, c2 = p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6
        d += f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
    return d + 'Z'

def biggest(mask):
    cs = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]
    return max(cs, key=cv2.contourArea)

out = {}
for name, (cx, cy, r) in {'small': (56, 104, 20), 'big': (124, 176, 31)}.items():
    zone = cv2.circle(np.zeros(gray.shape, np.uint8), (cx * 2, cy * 2), r * 2, 1, -1) > 0
    white = (gray > 205) & zone
    if name == 'big':  # keep only what the dark ring encloses, the head beside it is just as bright
        n, lab, st, _ = cv2.connectedComponentsWithStats((ink & zone).astype(np.uint8))
        ring_id = 1 + np.argmax(st[1:, cv2.CC_STAT_WIDTH] * st[1:, cv2.CC_STAT_HEIGHT])  # widest box is the ring, not the pupil
        white &= cv2.drawContours(np.zeros(gray.shape, np.uint8), [cv2.convexHull(np.column_stack(np.where(lab == ring_id))[:, ::-1])], -1, 1, -1) > 0  # ring may be open, its hull is not
    if name == 'small':  # the head top is just as bright, so cut the head circle away
        white &= cv2.circle(np.zeros(gray.shape, np.uint8), (98 * 2, 166 * 2), 63 * 2, 1, -1) == 0
    white = cv2.morphologyEx(white.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    white = cv2.drawContours(np.zeros_like(white), [biggest(white)], -1, 1, -1) > 0
    pupil = (gray < 100) & zone
    pupil = cv2.drawContours(np.zeros(gray.shape, np.uint8), [biggest(pupil)], -1, 1, -1)
    pupil = cv2.morphologyEx(pupil.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    eye = cv2.drawContours(np.zeros(gray.shape, np.uint8), [biggest(white | pupil.astype(bool))], -1, 1, -1)
    rim = cv2.dilate(eye, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))  # dark outline around the white
    out[name] = {'rim': smooth(biggest(rim), 2.5), 'white': smooth(biggest(eye), 2.5), 'pupil': smooth(biggest(pupil), 2)}
    ys, xs = np.where(eye); print(name, 'eye box', xs.min() / 2, ys.min() / 2, xs.max() / 2, ys.max() / 2)
    ys, xs = np.where(pupil); print(name, 'pupil box', xs.min() / 2, ys.min() / 2, xs.max() / 2, ys.max() / 2)
json.dump(out, open('eyes.json', 'w'), indent=1)
