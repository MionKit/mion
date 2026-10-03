# Cuts each mion's crop out of the reference image (the reference itself is not in the repo).
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
for n, c in json.load(open('mions.json')).items():
    if len(sys.argv) < 3 or n in sys.argv[2:]: im.crop(tuple(c['crop'])).save(f'{n}.png')
