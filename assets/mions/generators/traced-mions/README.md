# Traced mions

Creatures and the island's tree, made from the reference image: traced flat tones and line work, then finished by hand.

Needs Python 3 with `pillow numpy opencv-python-headless scikit-learn`. Run from this folder.

- `mions.json`: each creature's crop box in the reference, the areas that are surely it (`keep`) or surely not (`drop`), the tone count, and hand-drawn parts behind (`back`) or in front (`extra`), usually the eyes.
- `trace_mion.py <name>`: builds `../../creatures/<name>.svg` with a still `#shadow`, the traced `#body`, line work, a gloss streak and `#eyes`. Each eye is a rim, a white and a pupil group last, so the scene can make it follow the cursor.
- `worm.py`: the worm, drawn fully by hand as one tube with creases.
- `tree.py`: the tree-mushroom, traced roots under a hand-built cap of stacked rings, into `../../terrain/tree-mushroom.svg`.
- `crop.py <reference.png> [names]`: cuts the creature crops out of the reference image, which is not in the repo.

```bash
python3 trace_mion.py red-mushroom
python3 worm.py
python3 tree.py ../../terrain/tree-mushroom.svg
```
