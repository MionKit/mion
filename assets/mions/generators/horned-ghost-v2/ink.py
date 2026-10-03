# Finds the dark line work (outlines, pupils, stripes) as a mask: pixels much darker than their surroundings.
import sys, cv2, numpy as np
src, out, thr = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 28
rgba = cv2.imread(src, cv2.IMREAD_UNCHANGED)
alpha = cv2.erode(rgba[..., 3], np.ones((5, 5), np.uint8)) > 0
gray = cv2.cvtColor(cv2.bilateralFilter(rgba[..., :3], 7, 30, 7), cv2.COLOR_BGR2GRAY)
hat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
ink = ((hat > thr) | (gray < 85)) & alpha
ink = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(ink)
keep = np.isin(lab, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 25])
cv2.imwrite(out, keep.astype(np.uint8) * 255)
