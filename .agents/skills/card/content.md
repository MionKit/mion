# Content card: concept first, then reuse, then build

Results, comparisons, charts, sequences, and every card for the website. A content card is NOT limited to the
existing components: start from the idea, never from the parts list.

## 1. Concept

Write down, before any code:

- **The message**: one sentence the reader should leave with. It becomes the title; its key words go in `<em>`.
- **The proof**: the numbers or the code that back it. Measured right now, with their source.
- **The visual**: what shows it best. Before / after bars? Big numbers? Two windows side by side? A timeline?
  An arrow from problem to fix? Pick the clearest, not the one that happens to exist.
- **The motion** (website only): what should appear first, what after. The order tells the story.

## 2. Reuse

Read [components.md](components.md). Compose the existing components when they show the chosen visual well.
`CardFrame` + `CardWindow` always frame the card: they keep every card recognisable.

## 3. Build

None fits? Add a NEW component to `tools/code-card/components/`, never one-off markup inside a card,
so the next card can reuse it. A new component:

- `Card<Name>.vue`, registered by file name. `<script setup lang="ts">`, props validated (a validator or a `throw`
  in setup for anything a card can get wrong).
- Classes prefixed `cc-`, styles in `tools/code-card/card.css` under `.code-card`, sizes in px for a 1200px card
  (they scale), colours only from the tokens at the top of `card.css`, never a new olive hex.
- Its entrance animation: `data-cc="rise | grow | fade | line"` and `:style="nextStep()"` (from `shared.ts`) on
  each element that enters. A new kind of motion = a new `@keyframes` + `data-cc` value in `card.css`.
- Without the `cc-armed` class the card must show its final state: that is the PNG and the reduced-motion view.
- One test in `tools/code-card/test/components.test.ts`, one entry in [components.md](components.md).

## 4. Check, shoot, export

1. `pnpm miondevx card serve`: the card plays its animation; Play / Pause / Replay to judge the order and speed
   (tune with `step` / `speed` on `CardFrame`). A red banner lists failed layout checks: fix them.
2. `pnpm miondevx card shot <name>`, then look at the PNG (SKILL.md step 4).
3. For the website: `pnpm miondevx card export <name>`, then `::code-card{name="<name>"}` + `::` on the page.
   Commit the exported files with the card. Edit the card later → export again, or CI's check-tree fails.
