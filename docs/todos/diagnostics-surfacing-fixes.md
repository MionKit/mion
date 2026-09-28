---
type: fix
spec: guidelines
status: ready
created: 2026-09-28
---

# One place per job for mion's diagnostics: editor, dev server, build

## Intent

One Go checker produces every mion diagnostic (runtypes, rpc routes, enrichment files). Today three
places show them, and they disagree: the linter in the editor, the `vite dev` terminal, and the build.
The dev terminal repeats warnings the editor already shows, loses real errors after an edit, and the
linter can show a different level than the build for the same finding.

Follow how TypeScript and Vite split the work:

| Where | Shows | Why |
|---|---|---|
| Editor (the mion lint rules in the oxlint or ESLint extension) | every finding, at the level the checker gave it | the one place you read and fix findings |
| `vite dev` terminal and overlay | only what breaks running code, each finding once | like Vite, which never type-checks |
| Build and CI (`vite build`, `mion compile`, the lint CLI) | everything except Info (unless `levels: 'all'`), stops on errors | the gate |

Decided, not to reopen:

- The linter is the only editor channel. No TypeScript language service plugin (TypeScript 7 has no
  plugin support), no mion language server or VS Code extension of our own.
- The dev server and the linter never share one checker process (they are started by different tools).
- No per-code "lint only" flag. Info plus `levels`, and the lint-only checks, already cover it.

## Direction

The implementer plans the details and confirms every line number below first (they are from 2026-09-28).
Each numbered item gets its own commit and a test on the real path (Go resolver tests, the build plugin
hooks, real oxlint and ESLint runs).

### Part 1: lint rules by level, not by topic

A lint rule has one level, set in the lint config, so today each topic gets two rules (for example
`validate-non-serializable` and `validate-skipped-member`) and the checker's level only picks which one.
That gives two knobs for the same finding, and they drift: set a rule to `warn` and the editor shows a
warning while the build still stops.

1. **Replace every compiler-backed rule with three rules, one per level**, in ONE plugin named `mion`:
   ```jsonc
   "mion/error": "error",     // Error + RuntimeError
   "mion/warning": "warn",    // Warning, and errors lowered by a comment or downgradeErrors
   "mion/info": "off"         // turning it on replaces settings.runtypes.levels: 'all'
   ```
   - This covers runtypes, rpc route (MRT), enrichment (FT/MD/GE), comment (EXP/DWN) and config (CFG)
     codes, and the engine-error report. The message keeps the code (`VL002: ...`), so topics stay visible.
   - `settings.runtypes.levels` and the `downgraded-error` rule go away. Settings move to `settings.mion`.
   - `enforce-type-imports` stays a normal, configurable rule, as `mion/enforce-type-imports`. The checker
     never raises it, so it is the one exception.
   - Today the `@mionjs/*` rules are a second plugin object that oxlint never loads (it reads only the
     default export, and `packages/devtools/oxlint-recommended.json` lists no `@mionjs/*` rule), so route
     findings never reach oxlint users. One plugin fixes that; add an oxlint test that raises an MRT code.
   - `RULE_SPECS` and the prefix routing in `packages/devtools/src/lint/diagnosticRouting.ts` shrink to the
     level mapping. `packages/devtools/oxlint-recommended.json`, `configs.recommended` and the website's
     `.oxlintrc.json` copy follow.
   - Breaking change: every rule name changes. Note it in the changelog with the old to new mapping. If a
     config names an old rule, say so clearly rather than failing with no hint, where the host allows it.

### Part 2: the linter reports the right findings

2. **Another file's override findings show in the current file.** `scanFiles` appends the whole-program
   `sess.overrideDiagnostics` to every response (`ts-go-runtypes/internal/compiler/resolver/dispatch.go`
   ~597, ~948), and the report loop (`packages/devtools/src/lint/index.ts` ~119) never checks
   `diagnostic.site.filePath`. Linting `a.ts` showed `OVR001@b.ts:4` at an `a.ts` position. Report only
   findings whose site is the linted file.
3. **"This comment silenced nothing" (EXP001 / DWN001) fires for comments that are needed.** The lint pass
   judges codes it can never raise: `MET*` (it runs with `bundleApi: 'off'`) and the whole-program
   `BAT003` / `BAT008` / `BAT009`. The build's `generate` does the same for `OVR001`
   (`ts-go-runtypes/internal/diagnostics/expecterror.go` ~249-265, `resolver/expecterror.go` ~44-73).
   Judge only codes the request can raise.
4. **The linter ignores the tsconfig `downgradeErrors`.** The build honours it; the linter only honours
   the comment (`diagnosticRouting.ts` ~430). `serve --sources ops` already reads the tsconfig `levels`
   key and echoes it on `scanFiles`; carry `downgradeErrors` the same way. The plugin option stays
   build-only (the linter cannot see it); say so in the docs.

### Part 3: the dev server shows only what breaks running code

5. **One dev reporter, used by every dev-time path** (the edit handler, transform, the batch-source
   watcher, build start in dev):
   - Error (no code was made): terminal, and the browser overlay with the real code and place.
   - RuntimeError (the function throws when called): terminal only.
   - Warning and Info: no lines. One count line per batch instead, like
     `mion: 12 warnings, your editor shows them through the mion lint rules`.
   - Each finding prints once per dev session, keyed on code, args and site. Forget it once it is gone,
     so it prints again if it comes back.
   - It takes findings from BOTH `scanFiles` and `generate`. Today `applyHotUpdate`
     (`packages/devtools/src/core/unplugin.ts` ~781-869) drops `generate`'s, so a RuntimeError added
     while `vite dev` runs is never reported (appending `createValidateFn<(a: number) => void>()` reloads
     silently, while `vite build` reports VL003).
   - This also fixes: an Error added during `vite dev` printing 3 times (edit handler, then Vite's
     "Pre-transform error" and "Internal server error"), and `transform` printing the whole-program
     override findings once per transformed file.
6. **Each dev warning clears the terminal.** Vite 8 logs a plugin's `this.warn` with `clear: true`, so in
   a terminal only the last line of a batch stays. Print through the dev server's logger with
   `clear: false`, one block per batch.

### Part 4: the build shows everything, correctly

7. **The build misses override findings.** `generate` never includes them (`dispatch.go` ~785-824), so the
   build-start report misses OVR001, and OVR010 (Info) can never show even with `levels: 'all'`
   (`surfaceNewErrors`, `unplugin.ts` ~428, only takes Error and RuntimeError).
8. **The halt message is wrong and the overlay hides the real error.** It always says "N unsupported-type
   error(s)" (`unplugin.ts` ~1136), even for batch, pure-function, config or bundled-API codes. Name the
   first error's code and place, and pass the file and position to the bundler's error call so the Vite
   overlay shows them.

### Part 5: other fixes found in the same research

9. **The generated folder moves after the first dev edit.** With no `genDir`, build start writes
   `src/.mion/`; after the first save the dev server writes a second tree at `./.mion/`. Cause:
   `seedOverlay()` (`unplugin.ts` ~745) walks the whole project, so root files like `vite.config.ts` join
   the checker's program and its source root changes. Seen with `vite.config.ts` at the root and tsconfig
   `include: ["src"]`.
10. **A runtime error can name the wrong call site.** Two identical `createValidateFn<symbol>()` calls
    share one generated validator, and its error names whichever call site built it last
    (`throwProvenance`, `ts-go-runtypes/internal/cachegen/typefunctions/walker.go`). Pick a stable one and
    say when other call sites share it.
11. **Stale comments.** Claims that VS Code's `$tsc` problem matcher reads the build's lines (it needs a
    `TS<digits>` code, and Vite prefixes each line): `unplugin.ts` ~855, ~1115, ~1145, ~1177;
    `protocol.ts` ~395; `protocol.go` ~200; `pure-fns-cache.test.ts` ~397. Keep the `file(line,col)`
    format, the terminal can still open it. A removed socket client: `resolver-client.ts` ~130, ~168,
    ~309, ~338; `lint-worker.ts` ~88; `lint/index.ts` ~84. `protocol.go` ~82-87 says every MRT code is an
    error (MRT005 is a Warning). `packages/devtools/src/lint/CLAUDE.md` says the editor, linter and build
    never disagree, and its "Adding a rule" section describes the topic rules.

## How to reproduce

A small Vite project whose `node_modules/@mionjs/{run-types,devtools,router,core,bin-compiler}` link to the
workspace packages, `MION_BIN` pointing at `mion-bin/mion`, tsconfig `include: ["src"]` with
`customConditions: ["source"]`, `vite.config.ts` at the root using `mionVitePlugin`, and sources that raise
MKR003, VL002, a downgraded VL002, NE001, UPN001, VL011, an OVR001/OVR010 pair across two files, and MRT001.
Run `vite build`, `vite` (edit and restore files while it runs), and oxlint with
`packages/devtools/oxlint-recommended.json` and `-f json`.

## Docs

- `container/website/content/01.rpc/06.devtools/01.linter.md` and
  `container/website/content/02.runtypes/04.tooling/01.linting.md`: rewrite the rules section for the
  three level rules. Say plainly that these are not normal lint rules: every app gets the same three,
  one per level, and you cannot configure a single check in the lint config. To change one finding, use
  the `@mion-expect-error` / `@mion-downgrade-error` comments or the tsconfig `downgradeErrors`, which
  change the editor and the build together. Also: the linter reads the tsconfig `downgradeErrors`, the
  plugin option is build-only, `mion/info` replaces `levels: 'all'` in the lint settings, and
  `enforce-type-imports` is the one normal rule. Update the `.oxlintrc.json` and ESLint config examples.
- `container/website/content/02.runtypes/08.diagnostics/01.error-levels.md`: a "Where You See Each
  Finding" table (editor, dev terminal, overlay, build) and the dev server's print-once plus count line.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every item above is fixed with its own commit and a real-path test, and the reproduction project shows:
  the three `mion/*` rules in oxlint and ESLint (route codes included), no cross-file lint findings, the
  same level in the editor and the build for a code lowered in the tsconfig, no warning lines in the dev
  terminal (one count line instead), each dev finding printed once, VL003 reported after an edit, no
  `./.mion`, the overlay showing the real error.
- The changelog lists the rule rename.
- The PR carries the `website` and `pre-publish-e2e` labels.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
