# Horned ghost v2

Built from the reference image: cut out, then the eyes and body outline traced from it, and everything drawn in `compose.py`.

Needs Python 3 with `pillow numpy opencv-python-headless scikit-learn`. Run from this folder.

Rebuild the creature from the saved inputs:

```bash
python3 compose.py ../../creatures/horned-ghost-v2.svg
```

Redo the tracing from `ghost-crop.png` (only needed to change the eyes or the body outline):

```bash
python3 -c "from PIL import Image; c = Image.open('ghost-crop.png'); c.resize((c.width * 2, c.height * 2), Image.LANCZOS).save('ghost-crop-2x.png')"
python3 cutout.py ghost-crop-2x.png ghost-cut.png 50 30 490 630
python3 ink.py ghost-cut.png ghost-ink.png
python3 eyes.py
python3 bottom_curve.py
```
