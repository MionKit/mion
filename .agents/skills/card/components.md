# Card components

The library in `tools/code-card/components/`. Every card is one `CardFrame`. Per component: what it draws, its
props, its limits, how it enters. Add a component → add its entry ([content.md](content.md), step 3).

- **`CardFrame`**: background, title, subtitle, footer, badge.
  - Props: `#title` slot (`<em>` = accent words), `subtitle`, `footer`, `badge`,
    `kind` (`code` / `stats`: larger type, read as a phone thumbnail), `step`, `speed` (CSS times).
  - Limit: title on one line. Enters: title, then subtitle rise.
  - `kind="mini"`: a plain panel for a ~350px slot (a narrow page column, a phone), drawn at that size, never
    larger. Site panel colours, no `CardWindow`, no footer or badge (refused). Its PNG is 350px wide.
- **`CardWindow`**: editor window, three dots, file name. Props: `file`. Never animates: the empty frame shows first.
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

- **`CardLanes`** + **`CardLane`**: lanes that run to one shared wall (a compiler, a check): each passes or bounces.
  - Props: `CardLanes` `gate` (wall name), `outcome` (header over the results); `CardLane` `label`, `detail`,
    `steps` (`[{label, value}]`, value = one line of code), `result`, `note`, `stopped`, `packet` (≤ 8 characters).
  - Limits: 1 to 3 steps per lane. Enters: wall, then per lane its name, steps pop, a packet runs to the wall,
    passes (olive) or bounces (red ✕, lane shakes and greys out), then the result pops.
  - `step` ≈ `0.8s` leaves time to read.

- **`CardLoop`**: shows its items one at a time, in place, looping forever (a mini card's content).
  - Props: `items` (each handed to the default slot as `item`), `hold` (CSS time per item, default `4s`),
    `still` (the item the PNG and reduced motion show, default 0).
  - Limits: 2 to 8 items, all laid out at once, so every item must pass the layout checks.
  - Enters one step after the title, then loops. Items cross-fade. Inside an item, an element with `data-cc-at` and
    `--cc-at` (0 to 1) appears at that fraction of its turn; `data-cc-at="grow"` scales 0 → 1 from `--cc-at` to
    `--cc-until` instead.
- **`CardRoundTrip`**: one value's JSON round trip, top to bottom: server type, wire form, the same type on the
  client (✓), then what plain JSON gives (✕).
  - Props: `type`, `wire` (one line of code each), `lost` (optional), `plain` (its label, default `plain JSON`).
  - Inside a `CardLoop`: the server chip, a track growing down to the wire chip, then the client chip, then the
    plain-JSON line.

- **`CardValidationCall`**: one route call, top to bottom: the call, the client's check, the server's check, then
  the typed result. A stopped call fails the client check (✕) and its server row stays empty.
  - Props: `call`, `client` (code, one line each), `server` (a few words), `stopped`, `result` (code, optional,
    never on a stopped call).
  - Inside a `CardLoop`: the call chip, a track growing down (to the client row only when stopped), the client
    check, the server check, then the result line.

Entrance order = render order. `CardFrame`'s `step` is the gap between two elements, `speed` one entrance.
Bars: say in the subtitle what before and after are, or name them in `CardBars`.
