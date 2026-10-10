# Card commands

All from the repo root. No website or container needed.

- `pnpm miondevx card new <name> [--tmp]`: a starter code card + its snippet in `cards/` (or `tmp/`).
- `pnpm miondevx card serve [--port 4400]`: lists the cards. A card page re-renders on refresh, plays its
  animation (Play / Pause / Replay), shows failed layout checks, and downloads a PNG.
- `pnpm miondevx card shot <name…> | --all [--out <dir>]`: runs the layout checks, then a 2400px PNG beside
  each card.
- `pnpm miondevx card export <name…> | --all`: the card's HTML, stylesheet, fonts and player into
  `container/website/`, plus the manifest.
- `pnpm miondevx card test`: type check + tests of `tools/code-card` (no CI lane runs them).

## Layout checks

Measured by the page itself, in Chromium; `shot` refuses a card that fails one:

- the title, a tile value, a bar label or a fact wraps onto a second line;
- a code line is wider than its window;
- anything sticks out of the card.

A bad prop (5 tiles, a bar value that is not a number, a highlight outside the code) fails the render before any
browser starts, naming the component.

## The website export

- `container/website/app/data/cards/<name>.html` + `manifest.json`: the card and the hash of everything it was
  built from. `pnpm run check:tree` fails when a source changed without a new export.
- `app/assets/css/code-card.css`, `app/utils/codeCardPlayer.ts`, `public/fonts/code-card/`: shared by all cards.
- Never edit these by hand: change the card or the components, export again.

## If Chromium will not start

The error says what is missing. Either:

- Install Playwright's browser once: `pnpm exec playwright-cli install-browser chromium`.
- Or point at an existing Chromium: `--browser <path>`, or `MION_CARD_BROWSER=<path>` for every command and the
  tests (Claude cloud session: `/opt/pw-browsers/chromium`).
