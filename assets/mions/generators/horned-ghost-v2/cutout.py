# Cuts a creature out of a crop: colour hints seed GrabCut, then keep the biggest blob.
import sys, cv2, numpy as np
src, out, x0, y0, x1, y1 = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7])
img = cv2.imread(src)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
h, s, v = [hsv[..., i].astype(int) for i in range(3)]
mask = np.full(img.shape[:2], cv2.GC_BGD, np.uint8)
mask[y0:y1, x0:x1] = cv2.GC_PR_FGD
warm = ((h < 30) | (h > 165)) & (s > 70)          # sand, pebbles, soil shadow
mask[(mask == cv2.GC_PR_FGD) & warm] = cv2.GC_PR_BGD
cool = (s < 60) & (v > 120) | ((h > 80) & (h < 110) & (s > 60))  # greys, whites, teal
mask[(mask == cv2.GC_PR_FGD) & cool] = cv2.GC_FGD
bg, fg = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
cv2.grabCut(img, mask, None, bg, fg, 6, cv2.GC_INIT_WITH_MASK)
m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
m = np.where(lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
m = cv2.drawContours(np.zeros_like(m), cnts, -1, 255, -1)  # fill holes
m = cv2.GaussianBlur(m, (7, 7), 0); m = np.where(m > 127, 255, 0).astype(np.uint8)
rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA); rgba[..., 3] = m
cv2.imwrite(out, rgba)
check = img.copy(); check[m == 0] = (60, 30, 30); cv2.imwrite(out.replace('.png', '-check.png'), check)
