# Code card: share a code fragment fast

One editor window of code. For anything more (numbers, two windows, a chart) use [content.md](content.md).

1. `pnpm miondevx card new <name>` (add `--tmp` for a throwaway) writes two files:
   - `<name>.vue`: the card. Edit the title, subtitle, footer, badge, file name and `highlight`.
   - `<name>.snippet.ts`: the code shown, as plain text. Edit it like any file; it is never type checked.
2. `pnpm miondevx card serve`, open the card: it re-renders on every refresh. Fix any red check banner.
3. `pnpm miondevx card shot <name>`: checks the layout, then writes `<name>.png` next to the card.
4. Look at the PNG, send it (SKILL.md step 4).

```vue
<script setup lang="ts">
import code from './typed-match.snippet.ts?raw';
</script>

<template>
  <CardFrame subtitle="Match unknown data by type." footer="Just TypeScript." badge="@mionjs/run-types">
    <template #title><em>Typed match</em> coming soon to run-types</template>
    <CardWindow file="feed.ts">
      <CardCode :code="code" highlight="11-12" />
    </CardWindow>
  </CardFrame>
</template>
```

## Rules for a good code card

- About 15 lines of code at most. The window fits about 80 columns; a longer line fails the layout check.
- Highlight the two or three lines the card is about, not more (`3`, `11-12` or `3,7-8`, 1-based).
- The code keeps its hand layout: `tools/code-card/cards/` is never reformatted.
- `lang` on `CardCode` picks the colours: `ts` (default), `js`, `json`, `bash`, `go`…
