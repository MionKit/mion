---
type: feature
spec: full-plan
status: ready
created: 2026-09-03
---

# Bar-chart runtypes benchmarks, a homepage testing block, a softer glow, and a wider payload sweep

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
datasets gets a `source` field, a repo-relative path to the file that defines the group's
cases, so the page can link it and the gate can prove it exists.

- New shared module `scripts/website/bench-data/sources.mjs` with
  `sourceFor(caseRoot, group)`: scan the `.ts` files under `caseRoot` (recursively) for
  the one that `export const <GROUP>`s the group and return its repo-relative path; the
  synthetic `DATE` / `TEMPORAL` sections (split from `DATETIME` at `gen-docs.mjs:366-370`)
  resolve through `DATETIME`. Throw when a group resolves to nothing: a silent missing
  link is the drift this exists to catch. Move `groupToFile()`
  (`gen-serialization.mjs:262-271`) into it too, so both generators share one resolver.
- `gen-docs.mjs` `emitValidationBench` (line ~357): `validation` resolves against
  `container/benchmarks/shared/cases/` (validation, realworld, strict, json-schema
  live in sibling dirs, the scan covers them all), `validation-formats` against
  `container/benchmarks/shared/cases/format-validation/`.
- `gen-serialization.mjs` (sections emitted around line 577-630): `serialization`
  resolves against `packages/run-types/test/suites/serialization/`,
  `serialization-formats` against `.../format-serialization/`.
- The `typecost` dataset (kept as a table) is untouched.

**A.2 The summary math moves to the shared util.** `aggregateFor`
(`BenchTable.vue:629-672`) becomes `aggregateRows(sections, competitors, metricKey,
lowerBetter)` in `container/website/app/utils/benchAggregate.ts`, returning
`{key, label, source?, values}` rows: `Overall` first (the headline), then `REALWORLD`,
then the rest in dataset order. `BenchTable.vue` calls it (it still renders `Overall`
last; the caller orders). `shortVersion` (`BenchTable.vue:332-342`) and the
`comptime | jit | interpreted` strategy map (`strategyOf`, `BenchTable.vue:301-306`)
move to a new `app/utils/benchFormat.ts` together with one number formatter
(`1.2M`, `340.5k`, `59 B`, `2.1 kB`) so the table, the bars and the home summary
format one way.

**A.3 New component `container/website/app/components/content/RuntypesBenchBars.vue`**
(MDC `:runtypes-bench-bars{bench="…" metric="…"}`), the runtypes twin of
`ServerBenchBars.vue`:

- Props: `bench` (dataset slug, required), `metric` (one key, or a comma-separated
  list, required). Fetches `/bench-data/<bench>/index.json` on mount; the same
  `loading` / `missing` / `ready` states and the "run `pnpm miondevx bench --website`"
  note as its siblings. Root element `<div class="runtypes-bench-bars">` (the gate
  greps it).
- One run-info line at the top (date, cpu, os, node, from `index.meta`, the same
  string `BenchTable`'s `runInfo` builds).
- One `<section>` per summary row from `aggregateRows`: a caption with the group label,
  the case count, and a link "cases on GitHub" (`i-simple-icons-github`,
  `target="_blank"`, `rel="noopener noreferrer"`) built as
  `${appConfig.github.url}/blob/${appConfig.github.branch}/${section.source}`
  (`app/app.config.ts:13-19`). `Overall` has no link.
- Inside the section, one chart per listed metric, side by side on wide screens and
  stacked under 640px. A chart is a `<table>` with one `<tr>` per competitor, best
  first, bar width relative to the row's best value; the label carries the competitor
  name, `v<major.minor>` and the strategy tag when `index.showStrategy !== false`;
  the number label is the `valid` path, plus the `invalid` path after a middle dot
  when the metric has one (`encdec`: encode · decode). Lower-is-better metrics
  (`index.unit === 'count'` or `metric.lowerBetter`) sort ascending and the caption
  says "lower is better"; `null` rows render `n-a` with no bar, last.
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

- `content/index.md`: a fourth card after the benchmarks one, same shape
  (`::div{data-site="runtypes" class="home-subsite"}` → `:::u-page-section{class:
  home-features home-subsite-card}` → `home-split home-split--top`). It carries the
  runtypes palette because every number in it is runtypes today; when the rpc cards
  land the attribute can go. Left, `home-pitch`: `## Tested to the highest standard`
  and the closing sentence from the about page in homepage wording ("Every transform,
  cache shape and generated function is covered, on top of a large structured suite
  for validation, JSON, binary, mocks and reflection."). Right: the `:::::stat-tiles`
  block moved verbatim (`source: frontEndTests`, `source: goTests`, the literal `∞`
  fuzz tile), subtitles simplified for the homepage ("Vitest, every package";
  "go test, the type resolver"), and the fuzz tile gaining
  `action: {label: 'Fuzz harness on GitHub', to: 'https://github.com/MionKit/mion/tree/main/packages/run-types/test/fuzz'}`.
  Drop the no-op `:::::div{class="home-bench-column"}` wrapper (line 120) while there.
- `StatTiles.vue`: optional per-tile `action?: {label: string; to: string}` rendered as
  a small `UButton` (`i-simple-icons-github`, `target="_blank"`,
  `rel="noopener noreferrer"`) under the tile text; fix the header comment (it names
  a "Tested to the same standard" card).
- `content/02.runtypes/01.introduction/01.about-mion-runtypes.md:285-327`: section
  title "High performance compiled code" → "High performance validation"; drop the
  `:::div{class="rt-feature-row rt-feature-row--top"}` wrapper and the second card;
  the first card (heading, sentence, `:home-bench-table{validation="validation"}`,
  footer link) stays as is, alone at full width. Delete the two
  `.rt-feature-row--top` rules (`mion.css:640,659`), which lose their only user.
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

| rule (`mion.css`) | property | today | start from |
| --- | --- | --- | --- |
| `section[data-slot='root']:not(.home-subsite-card)::before` (1136) | `inset` | `12% 6%` | `-8% -6%` |
| same | `filter: blur()` | `64px` | `120px` |
| same | brand alpha / mix alpha | `22%` / `14%` | `16%` / `10%` |
| `.home-subsite::before` (1123) | `inset` | `8% 4%` | `2% -2%` |
| same | `filter: blur()` | `48px` | `80px` |
| same | brand alpha / mix alpha | `28%` / `16%` | `22%` / `12%` |

A negative inset spills past the section; check no ancestor clips it. The `@supports
(animation-timeline: view())` block and the `GradientBg` hero wash are untouched
(the theme test pins the former).

### Part E: the payload sweep on every framework

- `scripts/website/bench-data/mion-bench.mjs:232,265`: the sweep loops `APPS`.
  Delete `MION_APPS` (`container/mion-bench/shared/apps.mjs:141-142`, no other user)
  and the mion-only comments (`mion-bench.mjs:226-227`, `suites.mjs:43-46`); update
  the README row (`container/mion-bench/README.md:54`).
- Every lane must pass the harness's own gate at every size (`verify` /
  `verifyRejects`, `run.mjs:94-149`, then the non-2xx check at 328-341, which deletes a
  failed lane's result). express, fastify and hapi already raise their body limits to
  10 MB; confirm hono, elysia and the bare node server accept the 4 MB body and raise
  the limit where one answers 413.
- `content/03.benchmarks/02.rpc/04.payload-sizes.md`: description "How every server
  behaves as the request body grows."; the mion-only tip becomes a tip on what the
  sweep shows (identical route on every framework, the uws copy-free path above
  512 KB); the "Three servers" list becomes a pointer to the hello-world page's
  server list; the four bar sections stay.
- A pin in `repo-contracts.test.ts`: the driver runs the sweep over `APPS`
  (`MION_APPS` gone from the tree).
- Cost: the sweep grows from 3 lanes to 10 (four sizes each, 25 s per run), roughly
  +30 minutes on `pnpm miondevx bench --website`; `--quick` shortens it.

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

## Done when

- No `::bench-table` remains outside `07.type-checking.md`; the six runtypes pages
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
