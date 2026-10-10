---
type: feature
spec: full-plan
status: ready
created: 2026-10-10
---

# Code cards: a Vue component library, rendered standalone, embedded on the website

## Problem

`tools/code-card/` turns a markdown card (flat frontmatter + one code fence, or a `stats` fence of tiles / bars /
facts / diff) into a PNG. Three limits:

- **Fixed vocabulary.** A card can only be a code window or the four `stats` shapes. A new idea (a timeline, two
  windows side by side, an arrow from before to after) needs a parser change in `src/chart.ts`.
- **No website use.** The site can only show the PNG (`container/website/public/drizzle-type-cost.png`, linked from
  `container/website/content/01.rpc/07.devtools/01.linter.md:77`): fixed width, no theme, no motion, text not
  selectable.
- **Checks guess.** Wrapping and overflow are estimated from character counts (`src/card.ts:41` `maxColumns`,
  `src/chart.ts:12-13` label limits), not measured.

Assumes the `drizzle-type-cost` card, its PNG and the linter page image (PR #468) are on `main`.

Goal: cards built from a small, growing library of Vue components. The card tool renders them alone (no Nuxt, no
container). A card has two outputs from one source: a PNG (fully drawn, no motion) and an HTML fragment that carries
its own animation (bars growing, tiles appearing in sequence). `card export` hands the HTML + CSS + a tiny player to
the website, whose adapter only shows the card and starts the animation when it scrolls into view.

## Plan

### 1. Dependencies

- `tools/code-card/package.json:22-24`: add `vue` `3.5.40`, `vite` `8.0.16`, `@vitejs/plugin-vue` `6.0.8`, exact
  pins, the SAME versions the root `package.json:89,107,110` already pins (no second copy, no new package in the
  lockfile).
- `tools/code-card/vitest.config.ts:3-9`: add plugin-vue, drop the "No plugins" comment.
- `.vue` files get runtime prop validation only (no `vue-tsc`); `card test` keeps `tsc` for `src/`.

### 2. Component library: `tools/code-card/components/`

Starting set, ported from today's markup (`template.html`, `src/chart.ts:74-123`, `src/card.ts:175-189`):

| Component | Draws | Ported from |
| --- | --- | --- |
| `CardFrame` | stage background, title (`#title` slot, `<em>` = two-colour accent gradient), subtitle, footer, badge; `kind` prop (code / stats sizing) | `template.html` stage, `card.ts:163` `titleHtml`, `:192-205` slots |
| `CardWindow` | editor window, three dots, file name | `template.html` `.win` / `.bar` |
| `CardCode` | Shiki `tokyo-night` code, highlighted lines (async setup, SSR only) | `card.ts:176-189` |
| `CardTiles` / `CardTile` | 1-4 big numbers, 2x2 grid at 4 | `chart.ts:75-79` |
| `CardBars` / `CardBar` | before / after bars, % change, legend | `chart.ts:80-106` (width + delta math) |
| `CardFacts` / `CardFact` | 2-column fact list | `chart.ts:99-103` |
| `CardDiff` | GitHub-style `+added −removed` + 5 squares | `chart.ts:109-123` |

- Components render `div` / `span` / `p` only, never `h1` or `pre` outside `CardCode`, so the site's prose styles
  never reach them.
- Limits move into prop validators (4 tiles max, numeric `before` / `after`, not both 0).
- Each component owns its entrance animation (step 4): `CardBar` grows from 0, `CardTile` / `CardFact` fade and rise,
  `CardCode` lines appear one by one, `CardDiff` squares fill. Containers number their children (`--cc-i`) so they
  appear in sequence.

### 3. Shared stylesheet: `tools/code-card/card.css`

- Today's `template.html:8-333` rules, every selector under `.code-card`, plus resets for the site's prose styles.
- **Colours: site tokens only, no hex fallback.** `--accent` → `var(--site-accent)`, `--accent-mid` →
  `var(--site-brand-500)`, `--accent-light` → `var(--site-brand-300)`. Hex olive is forbidden under `app/`
  (`packages/devtools/test/website-theme-contracts.test.ts:57-85`). Greys, editor dots and diff red / green stay
  literal. On a RunTypes or Benchmarks page the card takes that subsite's colours.
- **Width-independent sizes.** One unit `--u: calc(100cqw / 1200)` on a `container-type: inline-size` wrapper; every
  size is a multiple of `--u`. The PNG shell sets the wrapper to 1200px, so the PNG is unchanged. On the site,
  `CardCode` keeps a readable minimum font size and scrolls sideways inside its window.
- The card stays dark in light mode (like a code block).

### 4. Animation: part of the card, plain CSS classes

Lightweight first: CSS `@keyframes` driven by classes on the card root, plus a ~40-line player. No animation library.

- **States.** No class = final state: the PNG, a page without JS, and reduced motion all show the fully drawn card.
  `cc-armed` = entrance start state (bars at 0, tiles hidden). `cc-play` = keyframes run. `cc-paused` =
  `animation-play-state: paused` on everything.
- **Sequence.** Each animated element gets `animation-delay: calc(var(--cc-i) * var(--cc-step))`; a card can tune
  `--cc-step` and `--cc-speed` on `CardFrame`. Order = document order unless a component sets `--cc-i` itself.
- **Player** (`tools/code-card/player.ts`, shipped with the export as plain JS): `arm(el)`, `play(el)`, `pause(el)`,
  `reset(el)`; `arm` does nothing under `prefers-reduced-motion`. It only toggles classes, so it stays the same when
  cards get richer animations later.
- **Preview without the website:** `card serve` arms every card and shows Play / Pause / Replay buttons, so motion is
  built and checked in the card tool. `card shot` never arms: the PNG is always the final state.
- Future, not now: count-up numbers, timelines with the Web Animations API, a play / pause control on the site.

### 5. Standalone render: `tools/code-card/src/render.ts` + `shell.html`

- Vite in SSR mode (`createServer({server: {middlewareMode: true}, appType: 'custom', plugins: [vue()]})`,
  `ssrLoadModule`) + `vue/server-renderer` `renderToString`. Library components registered globally under their
  file names. `NODE_ENV` never `production`, and `app.config.warnHandler` throws, so a bad prop fails the render.
- `shell.html` (replaces `template.html`): the head from `template.html:1-7`, the inlined fonts (`card.ts:46-50`,
  `:167-173`), `card.css`, and `container/website/sites/rpc/theme.css` inlined under `data-site="rpc"`, so colours
  have one source. Zoom stays the screenshot's 2x (`shoot.ts` `ZOOM`).
- **Layout checks in the page.** A small script in the shell measures after fonts load and sets
  `data-card-errors` on the root: title on more than one line, any horizontal overflow, a tile value or bar label
  that wraps. `serve` shows them as a red banner; `shoot` reads them with `playwright-cli eval` before
  `screenshot` (`src/shoot.ts:87`) and fails the card.

### 6. Remove the markdown format (no trace left)

- `src/card.ts`: delete `:14-42` (constants, `Card`, `maxColumns`), `:52-158` (`parseCard`, `validateCard`,
  `parseSize`, `parseHighlight`), `:163` `titleHtml`, `:175-213` `renderCardHtml`. Keep `PACKAGE_DIR`, `CARDS_DIR`,
  `TMP_DIR`, `CARD_NAME`, `escapeHtml`; `resolveCardPath` / `loadCard` (`:215-228`) resolve `<name>.vue`.
- Delete `src/chart.ts`, `template.html`, `test/card.test.ts`, `test/chart.test.ts`.
- `src/server.ts`: list `.vue` (`:31`), drop `POST /render` + `readBody` (`:47-60`, `:78-81`), render through
  `render.ts` (`:86-88`).
- `src/shoot.ts`: imports `:11`, the `.md` listing `:100`, `basename(..., '.md')` `:113` → `.vue`; add the
  `data-card-errors` read before `:87`.
- `src/new.ts`: `starterCard` (`:19-34`) becomes a `.vue` starter composing `CardFrame` + `CardWindow` +
  `CardCode`; file name `:38` ends in `.vue`.
- Convert `cards/typed-match.md` and `cards/drizzle-type-cost.md` to `.vue`, delete the `.md`, reshoot both PNGs and
  compare with the old ones by eye.
- `.prettierignore:27-28` (code cards laid out by hand) still applies to `.vue` cards; reword its comment.

### 7. Export to the website: `card export <name…> | --all`

- New `src/export.ts`. Per card: SSR fragment (no `<html>`, no fonts) → `container/website/app/data/cards/<name>.html`.
  Copies `card.css` → `container/website/app/assets/css/code-card.css` and the built player →
  `container/website/app/utils/codeCardPlayer.ts`. Writes
  `container/website/app/data/cards/manifest.json`: `{<name>: {hash, sources: [repo paths]}}`, where `sources` is
  the card, every component and `card.css`, and `hash` a sha256 over them.
- Register in `scripts/miondevx.mjs:516-525` and `scripts/lib/devx-registry.mjs:396-421`.
- Only cards someone exports reach the site; `tmp/` cards never do.

### 8. Website adapter: `container/website/app/components/content/CodeCard.vue`

- `import.meta.glob('../../data/cards/*.html', {query: '?raw', import: 'default', eager: true})`, `v-html` the
  fragment into a `.code-card` wrapper; imports `code-card.css`. Unknown `name` → a visible error box, never blank.
- The adapter adds no animation of its own. On mount it calls `arm()`, and an IntersectionObserver calls `play()` the
  first time the card scrolls into view. Before mount the card shows its final state (no blank flash, works without
  JS); reduced motion keeps it there.
- Use: `::code-card{name="drizzle-type-cost"}` replaces the image at `01.linter.md:77`; delete
  `container/website/public/drizzle-type-cost.png`. The PNG in `tools/code-card/cards/` stays for sharing.
- `app/components/AGENTS.md`: add `CodeCard` to the component list (export command, never hand-edit `app/data/cards/`).

### 9. Skills + docs

ONE skill, renamed `code-card` → `card` (matches `pnpm miondevx card`): `git mv .agents/skills/code-card
.agents/skills/card`. Its `SKILL.md` is a short router; each card kind has its own flow file.

- **`SKILL.md`** (router):
  1. Pick the kind from the request: a code fragment to share → **code card**; numbers, a comparison, a chart, a
     sequence, or a card for the website → **content card**.
  2. Unclear → ask with the question tool ("quick code card or content card?"). Never guess silently.
  3. Ask, as today: keep it in git (`cards/`) or throwaway (`tmp/`)?
  4. Follow the kind's file. Description line names both kinds so either request triggers the skill.
- **`code.md`**: the quick path. `card new <name>` → edit the `CardCode` starter (code, file name, highlighted lines,
  title) → shoot → look at the PNG → send. Today's "rules for good cards" (real API only, short, 2-3 highlighted lines).
- **`content.md`**: presentational cards. A card is not limited to the existing components:
  1. **Concept**: the one message, the numbers or code that prove it, the visual that shows it best.
  2. **Reuse**: compose existing components where they express that visual.
  3. **Build**: if none fits, add a NEW component to the library (never one-off markup inside a card), so the next
     card can reuse it. Each new component: validated props, colours from tokens only, a correct final state when
     not playing (the PNG), its own class animation (step 4), one unit test, one line in `components.md`.

  Then: preview motion with `card serve`, fix layout-check errors, shoot, look at the PNG, `export` when the site
  uses it. Real measured numbers only, estimates marked (today's `stats.md` rules).
- **`components.md`**: the component reference (props, limits, when to use, its animation). Replaces `stats.md`.
- **`commands.md`**: `new` / `shot` / `serve` / `export` / `test`, the layout checks, the Chromium fallback.
- The old skill name leaves no trace: update `tools/code-card/README.md:13`, `scripts/AGENTS.md:47-48`,
  `scripts/README.md:34` (all link `.agents/skills/code-card/`). The tool keeps its path `tools/code-card/` and
  package name. No skill index to update: both assistants discover `.agents/skills/<name>/` (Claude through the
  `.claude/skills` symlink).
- Same files: describe Vue cards; no line names the markdown format.

### 10. Staleness check (tools/ has no CI lane)

- `tools/` is in `FEEDS_NOTHING` (`scripts/ci/lanes.mjs:45`), so a test inside the tool never runs in CI.
- Add a sweep to `scripts/ci/check-tree.mjs` (always-on `lanes` job, git + node only): for each manifest entry,
  rehash `sources` with `node:crypto`; fail on a mismatch, a missing source, or a fragment without a manifest entry.
  Message names the fix: `pnpm miondevx card export <name>`.
- Unit-test the sweep from `packages/devtools/test/repo-contracts.test.ts` (the existing pattern, `check-tree.mjs:1-4`).

## Tests

- **Card tool (Vitest, plugin-vue):** each component renders; bad props throw (5 tiles, non-numeric bar, both 0);
  `CardBar` width + % change match today's math; `CardDiff` squares; `CardCode` marks highlighted lines;
  `export` writes a fragment with no `<html>` / `@font-face` and a stable manifest hash; `new`, `server`, `shoot`
  tests updated to `.vue`; player: `arm` / `play` / `pause` / `reset` set the right classes, `arm` is a no-op under
  reduced motion (jsdom `matchMedia` stub).
- **Animation in Chromium:** an armed, unplayed card has bars at width 0; after play + the last delay, its layout
  matches the unarmed card (final state = PNG).
- **Layout checks (Chromium):** a fixture card with a 2-line title fails; one with sideways overflow fails; both real
  cards pass.
- **check-tree:** stale hash fails, deleted source fails, orphan fragment fails, clean tree passes.
- **Website:** `website-theme-contracts.test.ts` passes with `code-card.css` under `app/`; the site builds
  (`website` label); with the website-browser skill, the linter page at phone and desktop width, light and dark,
  reduced motion on and off; the page's card matches the PNG's final state.

## Docs

- Website: `01.rpc/07.devtools/01.linter.md`, existing section "Separating Database Code": the image becomes
  `::code-card`. No new page: cards are a dev tool, not a framework feature.
- Internal: the skill, README, `scripts/AGENTS.md`, `scripts/README.md`, `app/components/AGENTS.md` (step 9).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Fuzzing

None: the inputs are hand-written cards, and the bar math is a two-number formula covered by unit tests.

## Out of scope

- Hydrating Vue on the site (the site gets static HTML; the adapter only mounts it and calls the player).
- Count-up numbers, Web Animations timelines, a play / pause button on the site (later; the player API allows them).
- `vue-tsc` type checking of `.vue` files.
- Turning other site images into cards.
- A visual diff of PNGs in CI.

## Done when

- Cards are `.vue` files built from `tools/code-card/components/`; no markdown card, parser, `stats` fence or
  `template.html` remains anywhere.
- `card new`, `shot`, `serve`, `test`, `export` work with no website or container running; layout checks fail bad
  cards.
- Both existing cards are converted, their PNGs reshot and checked by eye.
- Each component owns its class animation; `card serve` previews play / pause / replay; the PNG is the final state.
- The linter page shows `drizzle-type-cost` through `::code-card`, themed, responsive, playing when scrolled into
  view, still on its final state with reduced motion; the public PNG is gone.
- check-tree flags a stale export; repo-contracts covers it.
- One `card` skill routes to the code or content flow (asking when unclear); `content.md` teaches concept → reuse →
  build; no reference to the `code-card` skill name remains.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each
  committed on its own.
