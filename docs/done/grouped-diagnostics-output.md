---
type: feature
spec: guidelines
status: ready
created: 2026-10-04
---

# Group build messages by name

## Intent

Every finding prints as one long line, and the same message repeats for every site:

    src/routes/user.ts(12,7): error validate-non-data-root: Type `FileHandle` can never be validated: the generated function will always fail.
    src/routes/files.ts(4,3): error validate-non-data-root: Type `FileHandle` can never be validated: the generated function will always fail.
    src/jobs/upload.ts(41,2): error validate-non-data-root: Type `Socket` can never be validated: the generated function will always fail.

Add ONE setting that picks between today's output and a grouped one. Grouped collects the findings,
prints each diagnostic name once with its message, and the slot values per site:

    error validate-non-data-root (3)
      Type `{type}` can never be validated: the generated function will always fail.
      src/routes/user.ts:12:7   type=FileHandle
      src/routes/files.ts:4:3   type=FileHandle
      src/jobs/upload.ts:41:2   type=Socket

    warning json-restore-non-data-property-dropped (2)
      Property `{property}` has a non-serialisable value type (...): the JSON decoder drops it, so this property is silently not decoded.
      src/models/task.ts:8:5    property=onDone
      src/models/job.ts:16:5    property=result

    mion: 3 errors, 2 warnings in 5 files

Grouped is the DEFAULT. The other value keeps today's output byte for byte, which CI tools and
editors parse as `file(line,col): error <name>`.

Same information, less repetition. Nothing else changes: the levels, what stops the build, the exit
code, `downgradeErrors`, `levels: 'all'` and the `(downgraded)` note stay as they are. Levels were set
per diagnostic on purpose, and stopping on an Error avoids a chain of follow-on errors.

## Direction

The implementer plans the details; the name of the setting is theirs to pick. Verified pointers:

- No wrapping or patching of tsc / tsgo is needed. Every finding is already data (name, args,
  site) before it prints, and mion owns every printer, the tsgo type errors included
  (`renderDiagnosticsAt`, `ts-go-runtypes/internal/compiler/batchcompile/compile.go:317`; tsgo's
  own pretty printer is unused). So this is a catalog change, a new formatter and a switch.
- **Named slots.** 127 of the 147 messages take parameters (32 take two or more), as positional
  `{0}` / `{1}` in `ts-go-runtypes/internal/diagnostics/messages.go`. Give every slot a short name
  (`{type}`, `{property}`, `{name}`, `{pattern}` ...) so the grouped header can show the message once.
  `messages.go` is the one source: the TS catalog is generated from it
  (`pnpm miondevx core codegen diag` → `packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts`),
  and `renderHeadline` (`catalog.go:326`) plus its TS twin must render named slots to the exact
  text they render today. Whether the wire args stay positional or become named is the implementer's
  call; `cachegen/typefunctions/alwaysthrow_message.go` also reads the templates.
- **Grouped layout rules:**
  - Paths as `file:line:col` (clickable in terminals and editors).
  - Order: errors, then warnings, then info; inside, by name; sites by file, line, column
    (`diagnostics.Sort`).
  - A slot with the same value at every site goes into the header, not on each line.
  - A message with no slots lists only the sites.
  - A `Related:` line prints indented under its own site.
  - A downgraded site is marked `(downgraded)` on its own line; the group stays under its name.
  - Values can be long or contain spaces (a full union type): quote or wrap them so the line stays
    readable.
  - TypeScript errors (`TS2322` ...) arrive as finished text with no slots: group them by code, then
    by exact message, with the sites listed under each message.
  - One summary line at the end with the counts.
  - Names are long (`json-restore-non-data-property-dropped`), so the message goes on its own
    line under the name, never on the same line.
  - Some names share the exact same message (six `*-root` names say "Type `{0}` can never be
    validated"). Keep them as separate groups, since each name is what a reader turns off or
    downgrades.
- **One setting**, read the same way as `levels` / `downgradeErrors`: a plugin option, the tsconfig
  mion plugin entry, and a `mion` CLI flag. The plugin option wins over the tsconfig echo.
- **Where "the end" is, per mode:**
  - **CLI** (`mion compile`, `--no-emit`, `api-types`): the whole run. `printBuildDiagnostics`
    (`cmd/mion/main.go:679`) already prints at the end.
  - **Plugin build** (`buildStart` regenerate in `packages/devtools/src/core/unplugin.ts`): one
    grouped block per run instead of one `this.warn` per finding (`surfaceDiagnostics`,
    `core/surface.ts:62`), then halt exactly as today, same rule, same halt message.
  - **Per file transform** (`surfaceNewErrors`): group that file's batch.
  - **Dev server / hot reload** (`core/devReporter.ts`): group what `update` / `add` print per update.
    Keep its session dedupe and the per-file error overlay.
  - **Next.js**: it compiles per request (`runtypes/next/broker.ts:144`, `loader.ts:73`). The broker
    collects for a short window and prints one grouped block, instead of one warning per finding.
- **Fix in the same PR:** `DevReporter` never shows Info even with `levels: 'all'`, because
  `showInfo` never reaches it.
- **Out of scope:** changing any level or what halts; `mion enrich --no-emit` (`FormatDebug`) unless
  it is trivial to route through the same switch.

## Docs

- `container/website/content/02.runtypes/01.introduction/04.configuration.md`: existing section
  Option Reference, a new row for the setting.
- `container/website/content/02.runtypes/08.diagnostics/01.error-levels.md`: new section showing the
  grouped output and how to switch back.
- `container/website/content/02.runtypes/04.tooling/01.linting.md`: existing section Checking from
  the CLI, the flag.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every message slot has a name, and every message renders to exactly today's text (a Go test over
  the whole catalog, and the generated TS catalog check).
- One setting switches all lanes (CLI, plugin build, per file transform, dev server, Next.js)
  between grouped (default) and today's output, with Go and Vitest tests for both values per lane.
- The today's-output value prints byte-identical to the current output.
- Levels, halts, exit codes and downgrade behave exactly as before (existing tests stay green).
- Info shows on the dev server with `levels: 'all'`.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched
  source file, each committed on its own.

## Plan (approved 2026-10-04)

### Context

Todo `docs/todos/grouped-diagnostics-output.md`. Each finding prints as one long line, so the same
message repeats for every site. Add one setting, `logStyle: 'grouped' | 'lines'`, with `grouped` as
the default: each diagnostic name prints once with its message, and the values are listed per site.
`lines` keeps today's output byte for byte. Levels, halts, exit codes, downgrade and the halt
message stay exactly as they are.

Target output:
```
error validate-non-data-root (3)
  Type `{type}` can never be validated: the generated function will always fail.
  src/routes/user.ts:12:7   type=FileHandle
  src/jobs/upload.ts:41:2   type=Socket

mion: 3 errors, 2 warnings in 5 files
```

### 1. Named slots in the catalog (Go is the one source)

- `ts-go-runtypes/internal/diagnostics/messages.go`: each entry gets its slot names in arg order,
  and the template uses names: `{type}` instead of `{0}`. The wire args stay positional, so the
  87 `diagnostics.New` call sites do not change. Handles repeats (`{0}` twice) and out-of-order
  templates (`{0}…{2}…{1}`).
- `Definition` (`catalog.go:169`) gains `Slots []string`. `renderHeadline` (`catalog.go:326`)
  maps a name to its index. The unused `Template` field stays untouched.
- `internal/cachegen/typefunctions/alwaysthrow_message.go:51`: replace its hard-coded `"{0}"`
  with the first slot's name.
- Generator (`cmd/gen-diag-catalog`, `scripts/core/gen-diagnostics-catalog.mjs`): emit `slots`;
  regenerate with `pnpm miondevx core codegen diag`. TS `substitute`
  (`packages/devtools/src/core/diagnosticCatalog.ts:13`) maps names the same way.
- Migration check, run once during the change: every code renders the same text before and after,
  for the same args. Kept as a permanent Go test: every `{name}` in a headline is in `Slots`, and
  every slot is used.
- Side effect: the All Diagnostics page shows `{type}` instead of `{0}` (it prints raw headlines).

### 2. One grouped formatter, Go and TS twins

- Go `diagnostics.FormatGrouped` (new, in `internal/diagnostics/`), TS twin `formatGrouped` in
  `packages/devtools/src/core/surface.ts`.
- Rules:
  - Group key is the printed severity plus the name. A downgraded finding prints as warning, so it
    joins its own `warning <name> (downgraded)` group.
  - Order: errors, warnings, info. Inside, by name. Sites by file, line, column.
  - A slot with the same value at every site is filled into the header, not repeated per line.
  - Values: `name=value`, two spaces between slots, JSON-quoted when the value has a space.
  - `Related:` lines go indented under their own site.
  - Paths print as `file:line:col`.
  - A count line closes the block: `mion: N errors, M warnings in K files`.
- TypeScript errors in the CLI: `renderDiagnosticsAt` (`batchcompile/compile.go:317`) also returns
  structured entries (file, line, col, `TS` code, message text). Grouped mode groups them by code,
  then by exact message. `lines` keeps the current strings.
- Parity: shared fixtures (findings JSON plus expected text) under
  `ts-go-runtypes/internal/diagnostics/testdata/grouped/`, checked by a Go test and a Vitest test,
  so both twins print the same bytes.

### 3. The setting

- tsconfig key `logStyle` (`cmd/mion/config.go:106`), carried like `levels`:
  `resolver.Options.TsconfigLogStyle` (`main.go:~367`), echoed on the generate response
  (`protocol.go:179`, `MarshalJSON` around line 485, `dispatch.go:821`, TS `protocol.ts:378`).
- Validators: Go `ResolveLogStyle` beside `levels.go`, TS twin in `core/levels.ts`. Unknown values
  fail the same way a bad `levels` does.
- CLI flag `--log-style lines|grouped` on `compile` and `api-types`. The flag wins over the
  tsconfig. Update the `cli-surface.test.ts` help snapshots.
- Plugin option `logStyle` in `PluginOptions` (`core/unplugin.ts:168`),
  `MionRunTypesOptions` plus `toRunTypesOptions` (`src/options.ts:44,132`),
  `plugin-option-keys.ts`, and regenerate `codegen pluginkeys`. The plugin option wins over the
  tsconfig echo (`options.logStyle ?? gen.logStyle`, beside `unplugin.ts:886`).

### 4. Each lane

- **CLI** `printBuildDiagnostics` (`cmd/mion/main.go:679`): grouped prints one block (TS errors,
  then mion findings) before the existing `mion: compiled …` line. Exit code logic unchanged.
- **Plugin build**, `surfaceDiagnostics` (`surface.ts:62`): grouped collects and sends one
  `hostWarn` with the block, then halts as today (same `haltError` text).
  This covers `buildStart` (`unplugin.ts:901`), `surfaceNewErrors` per file (`:418`), and the watch
  rebuild (`:814`).
- **Enrichment gate** (`enrichDriftGate`, `unplugin.ts:562`): it formats per finding by hand
  today. Route it through `surfaceDiagnostics` with `halts: () => false`, then keep its own halt.
- **Dev server** (`core/devReporter.ts`): the new errors of each `update` / `add` print as one
  grouped block. Its session dedupe, the warnings count line and the per-file overlay stay.
- **Next.js**: no extra code. Each `hostWarn` already becomes one warning per request
  (`broker.ts:140`, `loader.ts:73`), so a grouped block arrives as one multi-line warning. The
  todo's "collect for a short window" idea is dropped; the todo gets reconciled to say so.
- **Lint plugin**: untouched (editors show one finding per site). It renders through
  `renderHeadline`, which keeps the same text.

### 5. Related fix in the same PR

`DevReporter` drops Info even with `levels: 'all'`, because `showInfo` never reaches it
(`devReporter.ts:61`). Pass `showInfo` in. With `levels: 'all'`, Info is counted in the dev
count line beside warnings (`mion: 5 warnings, 2 info (1 new) …`), the same way warnings are.

### Tests

- **Go:**
  - Slot consistency over the whole catalog.
  - `FormatGrouped` cases: slot folding, many slots, no slots, downgraded, related, order.
  - Grouped TypeScript errors.
  - The shared parity fixtures.
- **Vitest:**
  - `formatGrouped` against the same fixtures.
  - Every lane with both values: `compile-cli.test.ts` (grouped by default, `--log-style lines`,
    the tsconfig key, exit codes), `build-halt.test.ts`, `downgrade-errors.test.ts`,
    `batch-diagnostics.test.ts`, `enrich-plugin-sync.test.ts`, `dev-reporter.test.ts` (plus Info
    with `levels: 'all'`), `next-broker.test.ts`, `vite/buildFailure.spec.ts`.
  - Option parity and preset pass-through (`plugin-option-parity.test.ts`,
    `mion-presets.test.ts`).
  - Existing tests that pin the one-line format either set `logStyle: 'lines'` or assert the new
    block.
- **Fuzz (approved):** random sets of findings. Each finding's site and values appear exactly
  once, nothing is invented, and the Go and TS twins print the same bytes. The design goes through
  the fuzzy-testing skill.
- Marker test coverage rule: not affected, no marker API change.

### Docs

- `02.runtypes/01.introduction/04.configuration.md`, existing section Option Reference: a
  `logStyle` row.
- `02.runtypes/08.diagnostics/01.error-levels.md`, new section showing the grouped output and
  `logStyle: 'lines'`.
- `02.runtypes/04.tooling/01.linting.md`, existing section Checking from the CLI: the
  `--log-style` flag.
- The docs-simplifier pass after the review.

### Finish

1. Append this plan to the todo.
2. Implement.
3. Gate:
   - `go -C ts-go-runtypes test ./internal/... ./cmd/...`
   - rebuild `mion-bin/mion` and the devtools dist
   - `pnpm test`
   - `pnpm miondevx core codegen all --check`
   - lint and format
4. Reconcile the todo, then `git mv` it to `docs/done/`.
5. Run review-pr (automatic mode).
6. Run the docs and comments simplifier subagents, each committed on its own.
7. Open the PR with labels `website` and `pre-publish-e2e` (new public option).
8. Drive CI to green.

### Done when (from the todo)

- Every slot has a name, and every message renders to exactly today's text.
- One setting switches every lane between grouped (the default) and `lines`, tested both ways.
- `lines` output is byte-identical to today's.
- Levels, halts, exit codes and downgrade are unchanged.
- Info shows on the dev server with `levels: 'all'`.
- Both simplification passes are committed.
