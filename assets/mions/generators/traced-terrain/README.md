# Traced terrain

Simple terrain pieces from the reference image: the tile is drawn clean from its measured corners, the cone on it is traced into a few flat tones, with its dark lines and a gloss streak.

Needs Python 3 with `numpy opencv-python-headless scikit-learn`. Run from this folder, one crop per piece, the last number is how many cone tones:

```bash
python3 trace_terrain.py mountain-orange.png ../../terrain/mountain-orange.svg mountain-orange 5
python3 trace_terrain.py cone-yellow-teal.png ../../terrain/cone-yellow-teal.svg cone-yellow-teal 5
python3 trace_terrain.py cone-cream.png ../../terrain/cone-cream.svg cone-cream 5
python3 trace_terrain.py cone-small-teal.png ../../terrain/cone-small-teal.svg cone-small-teal 5
```
