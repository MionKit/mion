---
type: feature
spec: guidelines
status: ready
created: 2026-10-04
---

# Group build messages by code

## Intent

Every finding prints as one long line, and the same message repeats for every site:

    src/routes/user.ts(12,7): error VL002: Type `FileHandle` can never be validated: the generated function will always fail.
    src/routes/files.ts(4,3): error VL002: Type `FileHandle` can never be validated: the generated function will always fail.
    src/jobs/upload.ts(41,2): error VL002: Type `Socket` can never be validated: the generated function will always fail.

Add ONE setting that picks between today's output and a grouped one. Grouped collects the findings,
prints each code once with its message, and the slot values per site:

    error VL002 (3)  Type `{type}` can never be validated: the generated function will always fail.
      src/routes/user.ts:12:7   type=FileHandle
      src/routes/files.ts:4:3   type=FileHandle
      src/jobs/upload.ts:41:2   type=Socket

    warning RJ015 (2)  Property `{property}` has a non-serialisable value type (...): the JSON decoder drops it, so this property is silently not decoded.
      src/models/task.ts:8:5    property=onDone
      src/models/job.ts:16:5    property=result

    mion: 3 errors, 2 warnings in 5 files

Grouped is the DEFAULT. The other value keeps today's output byte for byte, which CI tools and
editors parse as `file(line,col): error CODE`.

Same information, less repetition. Nothing else changes: the levels, what stops the build, the exit
code, `downgradeErrors`, `levels: 'all'` and the `(downgraded)` note stay as they are. Levels were set
per code on purpose, and stopping on an Error avoids a chain of follow-on errors.

## Direction

The implementer plans the details; the name of the setting is theirs to pick. Verified pointers:

- No wrapping or patching of tsc / tsgo is needed. Every finding is already data (code, args,
  site) before it prints, and mion owns every printer, the tsgo type errors included
  (`renderDiagnosticsAt`, `ts-go-runtypes/internal/compiler/batchcompile/compile.go:317`; tsgo's
  own pretty printer is unused). So this is a catalog change, a new formatter and a switch.
- **Named slots.** 127 of the 147 messages take parameters (32 take two or more), as positional
  `{0}` / `{1}` in `ts-go-runtypes/internal/diagnostics/messages.go`. Give every slot a short name
  (`{type}`, `{property}`, `{code}`, `{pattern}` ...) so the grouped header can show the message once.
  `messages.go` is the one source: the TS catalog is generated from it
  (`pnpm miondevx core codegen diag` → `packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts`),
  and `renderHeadline` (`catalog.go:321`) plus its TS twin must render named slots to the exact
  text they render today. Whether the wire args stay positional or become named is the implementer's
  call; `cachegen/typefunctions/alwaysthrow_message.go` also reads the templates.
- **Grouped layout rules:**
  - Paths as `file:line:col` (clickable in terminals and editors).
  - Order: errors, then warnings, then info; inside, by code; sites by file, line, column
    (`diagnostics.Sort`).
  - A slot with the same value at every site goes into the header, not on each line.
  - A message with no slots lists only the sites.
  - A `Related:` line prints indented under its own site.
  - A downgraded site is marked `(downgraded)` on its own line; the group stays under its code.
  - Values can be long or contain spaces (a full union type): quote or wrap them so the line stays
    readable.
  - TypeScript errors (`TS2322` ...) arrive as finished text with no slots: group them by code, then
    by exact message, with the sites listed under each message.
  - One summary line at the end with the counts.
- **One setting**, read the same way as `levels` / `downgradeErrors`: a plugin option, the tsconfig
  mion plugin entry, and a `mion` CLI flag. The plugin option wins over the tsconfig echo.
- **Where "the end" is, per mode:**
  - **CLI** (`mion compile`, `--no-emit`, `api-types`): the whole run. `printBuildDiagnostics`
    (`cmd/mion/main.go:679`) already prints at the end.
  - **Plugin build** (`buildStart` regenerate in `packages/devtools/src/core/unplugin.ts`): one
    grouped block per run instead of one `this.warn` per finding (`surfaceDiagnostics`,
    `core/surface.ts:61`), then halt exactly as today, same rule, same halt message.
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
