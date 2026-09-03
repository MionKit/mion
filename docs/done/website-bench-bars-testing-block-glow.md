---
type: feature
spec: full-plan
status: done (2026-09-04)
created: 2026-09-03
---

# Bar-chart runtypes benchmarks, a homepage testing block, a softer glow, and a wider payload sweep

> Shipped, with these differences from the plan below:
>
> - The resolver returns a FILE NAME, not a repo-relative path, and each generator
>   supplies its own repo-relative prefix. `gen-serialization.mjs` runs inside the
>   benchmark image with the suite mounted under the marker package, nowhere near
>   `packages/run-types`, so it cannot compute that path itself. `sources.mjs` is
>   mounted beside it there, because a missing sibling import is a hard failure.
> - `aggregateRows` keeps its caller's section order and appends `Overall` last, which
>   is exactly what `BenchTable` already did; the charts move `Overall` to the front
>   themselves. Sharing the function without changing the table's output was worth more
>   than moving the ordering into it.
> - A second number rides a bar only on the serialization pages, where the prose says
>   it is the decode pass. On the validation pages the second path is the reject path,
>   and an unlabelled figure there is the noise these charts replaced.
> - Bar length always means BETTER. On the payload chart (lower is better) the ratio is
>   inverted, so the smallest payload fills the bar; drawn the other way the best row
>   sat at the top of the list with the shortest bar.
> - The homepage's tiles are authored in a new `HomeTestTiles.vue`, not in the page. On
>   the LANDING collection a component's frontmatter list collapses to a single tile
>   carrying only its first key, silently and with nothing in the build log; the same
>   block renders correctly on a docs page. That is why `StatTiles` stayed generic and
>   gained only the `action` button.
> - `http-node` needed an abort fix, not a body limit. Its async handler let a client
>   that went away mid-body escape as an unhandled rejection, which killed the process
>   and made the lane report zero. Only the 4 MB size produced it.
> - `.rt-card-footer` lost its `margin-top: auto` along with the two-column rules: with
>   one full-width card there is nothing to line the footer up against.
> - Each group is its OWN card with its title above it, not a section inside one long
>   panel, so these pages read like the rpc benchmark pages beside them in the sidebar.
> - A library that declines a metric on EVERY case is dropped from that chart instead of
>   drawn as a column of dashes. zod therefore leaves the two is-valid pages (it has no
>   fast is-valid check at all), and a note on each says its number belongs on the
>   validation-errors page, where every library does the same work.

## Problem

- **The runtypes benchmark pages are six wall-sized tables.** `::bench-table` renders
  every case (validation alone is 179 rows in 16 groups, times five libraries, times
  three input paths) under a summary block. The rpc pages next door make the same
  point with plain HTML bars (`ServerBenchBars.vue`). The summary block is what a
  reader needs: the `Σ Aggregated · geometric mean` table at the top of each page
  (`BenchTable.vue:773-820`), one row per group plus `Overall`. The per-case rows and
  their hover panels are the benchmark's own detail, better read at the source on
  GitHub.
- **The compile-time page mixes two things.** `07.compiletime.md` shows the whole-suite
  build cost of two libraries (`bench="compiletime"`, a stage-per-column table with no
  summary) and, below it, what each type costs the type checker (`bench="typecost"`).
  Only the second is worth a page.
- **The correctness page is off the pipeline.** Its data comes from the audit stage;
  the page has value and must be able to come back, but it should not render today.
- **The testing card lives on the wrong page.** "Tested to the highest standard" is the
  right column of a two-column row on the runtypes about page
  (`01.about-mion-runtypes.md:285-327`), beside the "Every library says they are the
  fastest" card. It is a cross-cutting claim and belongs on the homepage as a block of
  its own, built to take rpc test cards later.
- **The section halos on the about pages are too loud.** Every page section on the
  three about pages carries two blurred radial blobs (`mion.css:1136-1151`); they read
  as shapes rather than a wash.
- **The payload-sizes benchmark runs mion only** (`mion-bench.mjs:232,265` loop
  `MION_APPS`), although every other lane already accepts the 4 MB body (express,
  fastify and hapi raise their limits for exactly this sweep).

## Plan

### Part A: the runtypes benchmark pages become bar charts

**A.1 The generators name each group's source file.** Every section of the runtypes
datasets carries a `source`, the repo-relative file that defines the group's cases, so
the page can link it and the gate can prove it exists.

- New shared module `scripts/website/bench-data/sources.mjs`: `sourceFileIn(dir, group)`
  returns the name of the file in `dir` that declares `export const <GROUP>`, its own
  PascalCase file or the directory's `index.ts` (realworld, strict). It throws on a group
  it cannot place, which is the drift it exists to catch. `groupToFile()` moved here out
  of `gen-serialization.mjs`, so both generators share one resolver.
- `gen-docs.mjs` resolves per SUITE, which every result row names
  (`validation`, `format-validation`, `realworld`, `strict`), against
  `container/benchmarks/shared/cases/<suite>/`. That is exact rather than a search: three
  different files export a group called `JSON_SCHEMA`. The synthetic `DATE` and `TEMPORAL`
  sections both resolve through the `DATETIME` group they were split from.
- `gen-serialization.mjs` resolves against its own `SUITE_DIR` and joins the result to a
  spelled-out `packages/run-types/test/suites/<suite>` prefix.
- The `typecost` dataset (kept as a table) is untouched.

**A.2 The summary math moves to the shared util.** `aggregateFor` becomes
`aggregateRows(sections, competitors, metricKey, lowerBetter)` in
`container/website/app/utils/benchAggregate.ts`, returning `{key, label, source?, values}`
rows in the caller's section order with `__overall__` appended. `BenchTable` renders them
unchanged; the charts move `Overall` to the front. `formatValue`, `unitFor`,
`lowerBetterFor`, `strategyOf` and `shortVersion` move to a new `app/utils/benchFormat.ts`,
the last three reshaped to take the dataset's metrics rather than close over the table's
own index, so the table and the charts write a number one way.

**A.3 New component `container/website/app/components/content/RuntypesBenchBars.vue`**
(MDC `:runtypes-bench-bars{bench="…" metric="…"}`), the runtypes twin of
`ServerBenchBars.vue`:

- Props: `bench` (dataset slug, required), `metric` (one key, or a comma-separated
  list, required), `showMeta`. Fetches `/bench-data/<bench>/index.json` on mount; the
  same `loading` / `missing` / `ready` states and the "run `pnpm miondevx bench --website`"
  note as its siblings. Root element `<div class="runtypes-bench-bars">` (the gate
  greps it).
- One run-info line at the top (date, cpu, os, node, from `index.meta`, the same
  string `BenchTable`'s `runInfo` builds).
- One `<section>` per summary row from `aggregateRows`, each a heading followed by its
  own card. The heading carries the group label, the case count, and a link "cases on
  GitHub" (`i-simple-icons-github`, `target="_blank"`, `rel="noopener noreferrer"`) built
  as `${appConfig.github.url}/blob/${appConfig.github.branch}/${section.source}`
  (`app/app.config.ts`). `Overall` has no link. The component's own wrapper is not a
  card; the cards are the groups.
- Inside the card, one chart per listed metric, side by side while there is room and
  stacked below. A chart is a `<table>` with one `<tr>` per competitor that measured the
  metric at least once, best first, bar width relative to the row's best value; the label
  carries the competitor name, `v<major.minor>` and the strategy tag when
  `index.showStrategy !== false`;
  the number label is the `valid` path, plus the second path after a middle dot on the
  serialization datasets only (encode · decode, which their prose explains); on the
  validation datasets `showInvalid` marks the second path as the reject path and it is
  dropped. Lower-is-better metrics sort ascending, say "lower is better", and invert the
  bar ratio so the best value fills the bar; `null` rows render `n-a` with no bar, last.
- mion's bar is `var(--ui-primary)`, the others the muted mix; scoped CSS on `--ui-*`
  tokens only (`website-theme-contracts.test.ts` rejects any literal).

**A.4 The six pages** under `container/website/content/03.benchmarks/03.runtypes/`
swap `::bench-table{…}` + `::` for the inline component and gain one sentence of
context. These structural edits are intentional; the per-file component count changes
from one `::bench-table` block to one (or two) inline calls, and the code-fence count
stays 0 on every page.

| page | component call(s) |
| --- | --- |
| `01.validation.md` | `:runtypes-bench-bars{bench="validation" metric="validate"}` (keep the strict note) |
| `02.validation-formats.md` | `:runtypes-bench-bars{bench="validation-formats" metric="validate"}` |
| `03.getvalidationerrors.md` | `:runtypes-bench-bars{bench="validation" metric="validationErrors"}` (keep the strict note) |
| `04.getvalidationerrors-formats.md` | `:runtypes-bench-bars{bench="validation-formats" metric="validationErrors"}` |
| `05.serialization.md` | `:runtypes-bench-bars{bench="serialization" metric="encdec,payload"}` |
| `06.serialization-formats.md` | `:runtypes-bench-bars{bench="serialization-formats" metric="encdec,payload"}` |

The added sentence, in the site's voice: "Each chart is the geometric mean over the
cases in that group that every library supports; the link under the chart opens those
cases on GitHub." The serialization pages add: "Speed is the encode pass, decode after
the dot; bytes are the encoded payload, fewer is better." The bandwidth selector and
the derived round-trip number stay in `BenchTable` only; no page renders them any more.

**A.5 The gate and the contracts.**

- `scripts/website/check-static.mjs`: collect `:runtypes-bench-bars{…}` per page
  (`bench`, metric list) next to the existing `charts` / `tables` / `homeTables`;
  require `class="runtypes-bench-bars"` in the prerendered HTML; run the
  `checkBenchTable` dataset checks per listed metric (competitors present, columns
  exactly the `columns.mjs` list, every section and every column paints a value) with
  the hover-detail files not required; and require every section to carry a `source`
  whose file exists in the checkout (`existsSync(join(REPO_ROOT, source))`). Update
  the header comment (lines 1-33).
- `packages/devtools/test/repo-contracts.test.ts`:
  - the dataset walk at ~985 also collects `:runtypes-bench-bars{bench=…}` so every
    dataset a page names has a column list;
  - the benchAggregate pin (955-968) covers `RuntypesBenchBars.vue` too, with
    `aggregateRows` added to the forbidden-private-copy list;
  - a sibling of the `ServerBenchBars` shell test (1030-1042): the component carries
    `<div class="runtypes-bench-bars">` and the gate greps that class;
  - `sources.mjs` is the one resolver: both generators import it, neither defines
    `groupToFile`; and a real-file check that every group exported under
    `container/benchmarks/shared/cases/**` and `packages/run-types/test/suites/{serialization,format-serialization}/`
    resolves, plus `DATE` / `TEMPORAL` through `DATETIME`.
- `website-theme-contracts.test.ts:98`: add `RuntypesBenchBars.vue` to the scanned set.

### Part B: type-checking page, parked correctness page, lanes stop running

- `git mv content/03.benchmarks/03.runtypes/07.compiletime.md 07.type-checking.md`.
  Title "Type Checking", description "What each type costs the TypeScript compiler, per
  library." Body: the type-checker paragraph (line 12, reworded to open the page) and
  `::bench-table{bench="typecost"}`; the build-cost paragraph and its table go.
- `git mv content/03.benchmarks/03.runtypes/08.correctness.md container/website/parked/correctness.md`,
  with a leading HTML comment: why it is parked, and how to bring it back (move it to
  `content/03.benchmarks/03.runtypes/08.correctness.md`, put `cmdAudit` back in
  `cmdWebsiteBench`, drop the redirect). Nothing reads `container/website/parked/`:
  the collections read `content/` (`content.config.ts:23,36`), and so do the gate and
  the link and prefix tests. Note the dir in `container/website/CLAUDE.md` (Content
  organization).
- `public/_redirects`: `/benchmarks/runtypes/compiletime  /benchmarks/runtypes/type-checking  301`
  and `/benchmarks/runtypes/correctness  /benchmarks/runtypes/validation  301` (the
  redirect test requires a live target), each with a one-line comment.
- `scripts/website/bench-data/bench.mjs` `cmdWebsiteBench` (444-448): drop the
  `cmdCompiletime(cfg)` and `cmdAudit(cfg)` calls. The `bench compiletime` and
  `bench audit` commands, their registry rows, `container/benchmarks/compiletime/`,
  `buildCompiletimeBench` and `buildAlignmentBench` all stay; `gen-docs.mjs` already
  skips a dataset whose results are absent (`skip compiletime bench` / `skip alignment
  bench`). Update the `pr-heavy.yml:60-68` comment so it no longer cites the
  compile-time dataset as the reason the full build is not run (the rest of the
  reason stands).
- `content/03.benchmarks/01.introduction/01.mion-benchmarks.md:89,94`: "compile time
  and correctness" becomes "and type-checking cost" in the sentence and the link text.
- `docs/WEBSITE-DOCGEN.md`: the pages path is `03.benchmarks/03.runtypes/` (lines 8
  and 167 say `02.runtypes/`), the bars component and the `source` field join the
  "What ships" list, and a short note records the parked page and the two lanes that
  no longer run in the pipeline.

### Part C: the testing block on the homepage, one column on the about page

- `content/index.md`: a fourth card after the benchmarks one, naming one component
  (`:home-test-tiles`) rather than authoring the tile list, same shape
  (`::div{data-site="runtypes" class="home-subsite"}` → `:::u-page-section{class:
  home-features home-subsite-card}` → `home-split home-split--top`). It carries the
  runtypes palette because every number in it is runtypes today; when the rpc cards
  land the attribute can go. Left, `home-pitch`: `## Tested to the highest standard`
  and one sentence in homepage wording. Right: `HomeTestTiles.vue`, which supplies the
  three tiles (`frontEndTests`, `goTests`, the literal `∞` fuzz tile with its GitHub
  action) to the generic `StatTiles`. Its header comment records why the list is in
  code: authored as component frontmatter on this page it arrives as ONE tile holding
  only its first key. The no-op `home-bench-column` wrapper went too.
- `StatTiles.vue`: optional per-tile `action?: {label: string; to: string}` rendered as
  a small `UButton` (`i-simple-icons-github`, `target="_blank"`,
  `rel="noopener noreferrer"`) under the tile text, ignored on a tile that is already a
  link; header comment corrected.
- `content/02.runtypes/01.introduction/01.about-mion-runtypes.md:285-327`: section
  title "High performance compiled code" → "High performance validation"; drop the
  `:::div{class="rt-feature-row rt-feature-row--top"}` wrapper and the second card;
  the first card (heading, sentence, `:home-bench-table{validation="validation"}`,
  footer link) stays as is, alone at full width. The two `.rt-feature-row--top` rules
  went with it, and `.rt-card-footer` lost the `margin-top: auto` that only mattered
  when footers had to line up across columns.
- Remove the dead `:home-page-body` line (`01.about-mion-runtypes.md:11`,
  `01.about-mion-rpc.md:12`): no such component exists, it renders nothing.
- Tests: `repo-contracts.test.ts:808` `HOME` → `content/index.md` (comment: the tiles
  live on the root landing); `website-theme-contracts.test.ts:277` expects
  `SUBSITE_IDS.length + 1` cards and says why; a new assertion that the fuzz tile's
  action points at `packages/run-types/test/fuzz` and that path exists.

### Part D: the glow, bigger and softer

Starting values, tuned by eye afterwards on the three about pages and the root landing
in both themes (the `website-browser` skill, playwright-cli on :3100), final values
recorded in the PR:

The starting values were kept after checking them in both themes on all four pages.

| rule (`mion.css`) | property | was | is |
| --- | --- | --- | --- |
| `section[data-slot='root']:not(.home-subsite-card)::before` | `inset` | `12% 6%` | `-8% -6%` |
| same | `filter: blur()` | `64px` | `120px` |
| same | brand alpha / mix alpha | `22%` / `14%` | `16%` / `10%` |
| `.home-subsite::before` | `inset` | `8% 4%` | `2% -2%` |
| same | `filter: blur()` | `48px` | `80px` |
| same | brand alpha / mix alpha | `28%` / `16%` | `22%` / `12%` |

Nothing clips the negative inset. The `@supports (animation-timeline: view())` block and
the `GradientBg` hero wash are untouched (the theme test pins the former).

### Part E: the payload sweep on every framework

- `scripts/website/bench-data/mion-bench.mjs:232,265`: the sweep loops `APPS`.
  Delete `MION_APPS` (`container/mion-bench/shared/apps.mjs:141-142`, no other user)
  and the mion-only comments (`mion-bench.mjs:226-227`, `suites.mjs:43-46`); update
  the README row (`container/mion-bench/README.md:54`).
- No lane needed a body-limit change: express, fastify and hapi already raise theirs to
  10 MB, and hono, elysia and the bare node server impose none. One lane did fail, for a
  different reason: `http-node` let a client that went away mid-body escape its async
  handler as an unhandled rejection, killing the process, so it reported zero requests
  and refused everything after. Its handler is now a named function whose rejection is
  caught. Every framework lane already handled this internally.
- `content/03.benchmarks/02.rpc/04.payload-sizes.md`: description "How every server
  behaves as the request body grows."; the mion-only tip becomes a tip on what the
  sweep shows (identical route on every framework, the uws copy-free path above
  512 KB); the "Three servers" list becomes a pointer to the hello-world page's
  server list; the four bar sections stay.
- A pin in `repo-contracts.test.ts`: the driver runs the sweep over `APPS`
  (`MION_APPS` gone from the tree).
- Cost: the sweep grows from 3 lanes to 10, four sizes each, roughly +30 minutes on
  `pnpm miondevx bench --website`; `--quick` shortens it.

## Tests

- `pnpm exec vitest run --project devtools-core`: `repo-contracts` (the new and changed
  pins above), `website-links` (the two redirects, no dead link to the removed pages),
  `website-theme-contracts` (the new component scanned, the card count, the parallax
  block intact).
- `pnpm miondevx website test-counts --check` (the tiles moved, the seam still holds).
- `pnpm miondevx website build --no-bench` then `pnpm miondevx website check --static`
  on this host (the datasets exist locally): every bars page passes the new gate,
  `/benchmarks/runtypes/type-checking` renders, the parked page is absent.
- `pnpm miondevx bench servers` once to regenerate `servers-payload-sizes` with ten
  lanes and prove every lane passes the harness gate.
- Visual check in both themes: the six bars pages, the homepage block, the about page
  section, the glow.
- `pnpm run lint`, `pnpm run format`; the `website` label on the PR.

## Docs

- `docs/WEBSITE-DOCGEN.md` (Part B).
- `container/website/CLAUDE.md`: `RuntypesBenchBars` in the components list, the
  `parked/` dir in Content organization.
- `container/mion-bench/README.md` (Part E).

## Fuzzing

Not a candidate: presentation work. The one piece of math moves without changing and
the contract tests pin that no component carries a private copy.

## Out of scope

- The compact-JSON wire mode and the compact charts under the server benchmarks (their
  own todo).
- Deleting the compile-time lane or the audit lane; they stay runnable, just not in the
  website pipeline.
- Restyling `BenchTable` or the type-checking page, which keeps the table.
- The rpc test cards for the testing block (the block is built to take them).
- The `GradientBg` hero wash and its per-page opacity.
- The stale, git-ignored `public/bench-data/strict/` dir on this host.

## Verification record (2026-09-04)

- `pnpm exec vitest run --project devtools-core`: 988 passing, including the new pins
  (the shared formatters, the one source resolver with a real-file check per suite, the
  bars shell class, the landing page naming the tiles component, the fuzz link's target
  existing, the sweep looping every app).
- `pnpm miondevx bench serialization` regenerated both serialization datasets in the
  image, which is what proved the mounted resolver: every section carries its `source`.
- `pnpm miondevx website build --no-bench` + `website check --static`: 69 pages, PASS,
  with `every section links a case file that exists` on all four bar-chart datasets.
- `pnpm miondevx bench servers sweep --quick`: all 40 lanes (10 apps x 4 sizes) pass the
  harness's own correctness gate, and every size ships 10 rows.
- `pnpm run lint` and `pnpm run check-format`: clean.
- Browser check on the container dev server (playwright-cli, :3100), light and dark: the
  six chart pages, the homepage block, the about-page section and the glow. It earned its
  place: it caught a shadowed `values` in the chart builder, a hard syntax error that
  killed the render worker on every one of those pages while the static build had passed
  before that edit. It also caught the inverted payload bars and the collapsed tile list.

## Done when

- Done. No `::bench-table` remains outside `07.type-checking.md`; the six runtypes pages
  render one chart per summary row (two on the serialization pages), `Overall` first,
  every group with a working GitHub link, and `check --static` proves each link's file
  exists.
- `/benchmarks/runtypes/type-checking` shows only the type-cost table;
  `/benchmarks/runtypes/compiletime` and `/benchmarks/runtypes/correctness` redirect;
  `container/website/parked/correctness.md` exists with its re-enable note;
  `pnpm miondevx bench --website` runs neither the compile-time nor the audit stage.
- The homepage has the testing block (three tiles, the GitHub button on the fuzz tile)
  and the runtypes about page has the single-column "High performance validation"
  section; `test-counts --check` and the tile contract pass against `index.md`.
- The halo values changed and were checked by eye in light and dark on all four pages.
- The payload-sizes page lists every lane at every size.
- `pnpm test`, `website check --static`, lint and format are green.
