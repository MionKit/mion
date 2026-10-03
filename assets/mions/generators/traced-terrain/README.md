# Traced terrain

Simple terrain pieces from the reference image. The tile is drawn clean from its measured corners. What sits on it is either traced (cones, with their dark lines and a gloss streak), drawn by hand (sand mounds, raised slab), or nothing (bare tiles).

Needs Python 3 with `numpy opencv-python-headless scikit-learn`. Run from this folder, one crop per piece:

```bash
python3 trace_terrain.py <crop>.png ../../terrain/<name>.svg <name> <top> [off-top] [thickness]
```

- `top`: how many traced cone tones, `0` for a bare tile, `-1` for a hand-drawn mound, `-2` for a raised slab.
- `off-top`: how far from the tile colour counts as cone (default 22).
- `thickness`: side height in px for tall blocks (default: taken from the bottom corner).

The pieces in `../../terrain/`:

```bash
python3 trace_terrain.py mountain-orange.png ../../terrain/mountain-orange.svg mountain-orange 5
python3 trace_terrain.py mountain-orange-low.png ../../terrain/mountain-orange-low.svg mountain-orange-low 5
python3 trace_terrain.py cone-yellow-teal.png ../../terrain/cone-yellow-teal.svg cone-yellow-teal 5
python3 trace_terrain.py cone-cream.png ../../terrain/cone-cream.svg cone-cream 5
python3 trace_terrain.py cone-small-teal.png ../../terrain/cone-small-teal.svg cone-small-teal 5
python3 trace_terrain.py mound-orange.png ../../terrain/mound-orange.svg mound-orange 4
python3 trace_terrain.py mound-sand-cream.png ../../terrain/mound-sand-cream.svg mound-sand-cream -1
python3 trace_terrain.py mound-sand-small.png ../../terrain/mound-sand-small.svg mound-sand-small -1
python3 trace_terrain.py block-blue.png ../../terrain/block-blue.svg block-blue -2
python3 trace_terrain.py tile-teal-light.png ../../terrain/tile-teal-light.svg tile-teal-light 0
python3 trace_terrain.py block-slate.png ../../terrain/block-slate.svg block-slate 0 22 18
python3 trace_terrain.py tile-teal.png ../../terrain/tile-teal.svg tile-teal 0 22 16
```
