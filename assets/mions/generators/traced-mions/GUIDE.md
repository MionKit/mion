# Building a mion by hand

How the blue helmet went from a trace to a finished mion, as rules for the rest. The goal: every mion made of hand-built shapes, with the trace used only to measure and pick colours.

## Why hand-built

- Cleaner: no blotchy tones, no ground stuck to the edges, no jagged outlines.
- Smaller: a traced patch is a long chain of curve points and every tone layer repeats the outline. A hand-built piece is about 14 points, written once and reused with `<use>`. The blue helmet went from 21.4 to 19 KB with more detail, and the worm is 2.8 KB.
- Animatable: every piece is its own named group.

## The process

1. **Measure on the trace.** Open the crop with a grid (`grid.py` in the scratch tools, or the traced SVG) and read off centres, sizes and angles of each part. Sample colours from the traced tones.
2. **Write a parts module**, `<name>.py` next to `trace_mion.py`, with `back()` (pieces behind the body) and `extra()` (the body and everything in front). Point the mion at it in `mions.json` with `"parts": "<name>"`.
3. **Grow the body until it covers the traced layer**, then set `"trace": false` and a `"shadow": [x, ground y, half width]`. The tracing is gone and the file shrinks.
4. **Check side by side with the original** after every change, zoomed in on small parts.
5. **Commit** once it is approved.

## Building blocks (in `common.py`)

| Function | Makes |
|---|---|
| `wobbly(cx, cy, rx, ry, tilt, waves, box=2)` | a lumpy oval; `box=3` squares it off a little toward a rounded rectangle |
| `stack(name, parts, base, light, crease, shine, rand, vary)` | pieces stacked in order, each with a dark crease toward the piece before it, a lighter patch up-left, maybe a shine; `vary` gives each piece its own shade |
| `cone(cx, cy, top, bottom, h, tilt, rand)` | a cone section: a rounded trapezoid, `top` wide narrowing (or widening) to `bottom` |
| `shade(color, f)` | a colour moved toward white (f > 0) or black (f < 0) |

Stack parts are `(cx, cy, rx, ry, tilt)` with an optional sixth value for `box`, or a `cone(...)`.

## Rules per part

**Body**
- A lumpy outline (`wobbly`, small bumps around 0.035) filled with the darkest tone, then 2 lighter lumpy copies nudged up-left, clipped to the outline, and one shine streak. The same stone trick as everything else.
- A body made of more than one rounded shape (head and body, a mushroom cap and stem, a pig's head and belly) is a `stack` of those shapes: each one lumpy, each with its crease where it sits on the one before, so they read as one creature.
- Make it big enough to cover what the trace showed, so the trace can go.

**Eyes**
- Lumpy whites, never perfect circles.
- The rim is the white's own shape pushed down-right and a little bigger, so it shows only as a crescent on the lower right. The upper left of the white has no border.
- Structure the scene needs for cursor following: `<g id="eye-N">` holding the rim, then the white, then a `<g>` with the pupil and its shine dot, last.
- A glass or glint highlight that should stay still goes outside the eye group.

**Horns, antennae, tails**
- 2 to 4 stacked pieces each, overlapping enough to read as one part, never as beads.
- Lower pieces a little boxy (`box=3`), the top piece round.
- A visible bend: move each piece along a curve and grow its tilt toward the tip. Straight stacks look stiff.
- Shade variation per piece (`vary` 0.05 to 0.08).
- A piece sitting on a round body gets tilted so its base edge follows the curve: point its axis out from the body's centre (`asin` of the direction's x), and sink it 2 px into the body.

**Legs**
- `cone()` sections, wide where they meet the body and narrowing toward the ground; the top section can be much wider so the leg reads as one long taper.
- Slight splay outward on the side legs.
- A front leg is drawn over the body; the others behind it.
- An odd detail on one leg (a round foot) gives character.

**Layering**
- `back()`: pieces behind the body (back legs, antennae that grow from behind).
- `extra()`: body, then front pieces (front leg, a front antenna), then eyes, then still highlights.
- The ground `#shadow` stays its own group so the scene keeps it still while the mion bobs.

## Keeping shapes stable

- Every piece takes its bumps and shines from a seeded `random.Random`, so a mion looks the same on every run.
- Changing one piece must not reshuffle the others: give the changed piece its own stream, and if it used the shared stream before, advance the shared one by the same number of draws (see the blue helmet's front antenna).
- Moving a piece's position or size never changes the draws; changing an oval into a cone does.

## File size

- Shapes written once and reused with `<use>` (the stack does this for its pieces).
- Whole-number coordinates for big shapes, one decimal for small ones (`wobbly` does this): rounding small shapes to whole pixels makes their edges jagged.
- 14 points per lumpy oval is enough.

## Plan for the rest

| Mion | Body | Parts to build |
|---|---|---|
| red mushroom | cap + stem as a 2-shape stack | pink bobble on the cap; the pale fin on the stem as a small stacked piece; its eye lumpy with the crescent rim |
| red ball | one lumpy ball | thin legs already hand-drawn; mouth dot; eye lumpy with crescent rim |
| seal | head + body stack | horn as stacked rings with a bend (like the horned ghost); small ear; lavender cone legs; two small eyes |
| pig | head + belly stack | teal ear as a 2-piece stack; short cone legs; the big ringed eye and the small eye |
| crawler | head + long body stack | 3 eyes of different sizes; cone legs |
| teal hood | hood + snout stack | 2 eyes (big hood eye, small snout eye); cone legs |
| plant mion | white fin-shaped body | palm fronds as stacked leaf pieces fanning out; yellow fruit; orange antenna as a stack; one big eye |
| rock mion | stone dome as a lumpy stack on a clean tile (like the terrain tiles) | pink cap stack; eye holes with glints as eyes |
| worm | already hand-built | lumpy eyes with crescent rims to match |
