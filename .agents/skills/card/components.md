# Card components

The library in `tools/code-card/components/`. Every card is one `CardFrame`. Per component: what it draws, its
props, its limits, how it enters. Add a component → add its entry ([content.md](content.md), step 3).

- **`CardFrame`**: background, title, subtitle, footer, badge.
  - Props: `#title` slot (`<em>` = accent words), `subtitle`, `footer`, `badge`,
    `kind` (`code` / `stats`: larger type, read as a phone thumbnail), `step`, `speed` (CSS times).
  - Limit: title on one line. Enters: title, then subtitle rise.
- **`CardWindow`**: editor window, three dots, file name. Props: `file`. Enters: rises.
- **`CardCode`**: Shiki code with highlighted lines.
  - Props: `code`, `lang` (default `ts`), `highlight` (`3`, `11-12` or `3,7-8`, 1-based).
  - Limit: no line wider than the window. Enters: lines slide in one by one.
- **`CardTiles`** + **`CardTile`**: big numbers in the accent, a label under each; four make a 2x2 grid.
  - Props: `CardTile` `value`, `label`. Limits: 1 to 4 tiles, value up to 12 characters, one line.
  - Enters: each tile rises.
- **`CardBars`** + **`CardBar`**: grey before bar, olive after bar, the % change, a legend.
  - Props: `CardBars` `before`, `after` (legend words); `CardBar` `label`, `before`, `after` (numbers, `,` allowed),
    `unit`.
  - Limits: not both 0, label on one line. Enters: the row rises, then the olive bar grows.
- **`CardFacts`** + **`CardFact`**: a 2-column label / value list. Props: `label`, `value`. Limit: one line.
  Enters: each row rises.
- **`CardDiff`**: GitHub's `+added −removed` and 5 squares in their ratio.
  - Props: `added`, `removed` (whole numbers), `label`. Enters: rises, then the squares fade in.

Entrance order = render order. `CardFrame`'s `step` is the gap between two elements, `speed` one entrance.
Bars: say in the subtitle what before and after are, or name them in `CardBars`.
