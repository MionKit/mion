# Flattens a cutout to K colours: smooth, k-means in Lab, then a majority filter to drop specks.
import sys, cv2, numpy as np
from sklearn.cluster import KMeans
src, out, K = sys.argv[1], sys.argv[2], int(sys.argv[3])
rgba = cv2.imread(src, cv2.IMREAD_UNCHANGED)
alpha = cv2.erode(rgba[..., 3], np.ones((5, 5), np.uint8))
img = rgba[..., :3]
if len(sys.argv) > 4:  # paint over the ink so flat colours run underneath the lines
    ink = cv2.dilate(cv2.imread(sys.argv[4], 0), np.ones((5, 5), np.uint8))
    img = cv2.inpaint(img, ink, 6, cv2.INPAINT_TELEA)
for _ in range(3): img = cv2.bilateralFilter(img, 9, 40, 9)
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
fg = alpha.reshape(-1) > 0
km = KMeans(K, n_init=6, random_state=1).fit(lab[fg])
labels = np.full(fg.shape, K, np.int32); labels[fg] = km.labels_
labels = labels.reshape(alpha.shape)
for _ in range(2):  # majority filter: each pixel takes its neighbourhood's most common label
    votes = np.stack([cv2.blur((labels == k).astype(np.float32), (11, 11)) for k in range(K + 1)])
    labels = votes.argmax(0)
centers = cv2.cvtColor(km.cluster_centers_.astype(np.uint8)[None], cv2.COLOR_LAB2BGR)[0]
res = np.zeros((*alpha.shape, 4), np.uint8)
for k in range(K): res[labels == k] = (*centers[k], 255)
cv2.imwrite(out, res)
print(' '.join('#%02x%02x%02x' % tuple(c[::-1]) for c in centers))
