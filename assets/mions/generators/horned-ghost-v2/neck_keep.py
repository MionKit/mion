# Writes the mask of where the traced neck can show: the neck box minus the head and horn, with a margin for curve smoothing.
import sys, cv2, numpy as np
MARGIN = 10   # in 1x units, more than the tracer's smoothing reach
keep = np.zeros((640, 520), np.uint8)
cv2.rectangle(keep, ((108 - MARGIN) * 2, (90 - MARGIN) * 2), ((206 + MARGIN) * 2, (226 + MARGIN) * 2), 255, -1)
cv2.ellipse(keep, (round(97.7 * 2), round(166.2 * 2)), ((64 - MARGIN) * 2, (67 - MARGIN) * 2), 154, 0, 360, 0, -1)   # head
cv2.rectangle(keep, ((90 + MARGIN) * 2, 0), ((178 - MARGIN) * 2, (108 - MARGIN) * 2), 0, -1)   # horn
cv2.imwrite(sys.argv[1], keep)
