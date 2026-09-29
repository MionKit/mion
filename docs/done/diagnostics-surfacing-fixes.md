---
type: fix
spec: guidelines
status: done
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

## Plan (approved 2026-09-28)

### Context

One Go checker makes every mion finding. The editor (linter), the dev server and the build each show them, and
they disagree. Target: the editor shows every finding at the checker's level, the dev server shows only what
breaks running code (once), the build shows everything and stops on errors. The research added a few problems
the todo did not list; they are on the same path, so they ship here (marked NEW).

Decided with the user: lint rules become `mion/error`, `mion/warning`, `mion/info` in ONE plugin named `mion`;
no new setting to raise single warning codes to errors (this repo's own scripts do it from oxlint's JSON output).

Setup first: the devtools dist is not built on this host, run `bash scripts/setup-claude-web.sh`, then
`pnpm run check:builds`. Rebuild `mion-bin/mion` after every Go edit, and the devtools dist after every devtools
src edit.

### Commits (each with its own test on the real path)

#### Go checker (`ts-go-runtypes/internal/compiler/resolver/`)

1. **Override findings in the right place.** `generate` appends `sess.overrideDiagnostics` and CFG002
   (`dispatch.go` ~783-828); `scanFiles` and `transform` return only those whose site is in `request.Files`
   (~597, ~950). NEW: `generate` also misses marker findings of files an earlier `scanFiles` already scanned
   (`scan.go:55-68`, `programScanDiagnostics`); make generate report every file's findings.
   Test: two files with `overrideValidate<string>`: scanFiles on one returns no OVR from the other; generate
   returns OVR001 + OVR010; scan then generate on the same session still returns the first file's findings.
2. **Judge only codes the op can raise** (EXP001 / DWN001). Add a per-code "raised by" attribute to the Go
   catalog (`diagnostics/catalog.go` `Definition`): per-file scan, whole-program generate, or both. `canJudge`
   (`diagnostics/expecterror.go` ~249-266) checks the code, not only its family; `directiveScope`
   (`resolver/expecterror.go` ~45-74) passes the op, and MET codes count on scan only when `apiLaneOn()`.
   Test: `@mion-expect-error BAT003` / `MET006` not flagged by scanFiles; `@mion-expect-error OVR001` not flagged
   by generate; a truly stale comment still flagged by both. Extends `expecterror_test.go`.
3. **Linter reads the tsconfig `downgradeErrors`.** `serve --sources ops` (`cmd/mion/main.go` ~502-507) reads
   it next to `levels`, and scanFiles echoes it (`dispatch.go` ~617). The lint worker applies it like the build
   (`isDowngraded`, `core/downgradeErrors.ts`). Test: Go echo test + a real oxlint run where a tsconfig-lowered
   VL002 shows as a warning.
4. **Stable call site in a runtime error.** `throwProvenance` (`cachegen/typefunctions/walker.go` ~329) picks
   the smallest (absolute path, line, col), and the message adds how many other call sites share it. NEW: the
   disk cache stores the site inside the cached message (`module.go` ~431, ~619); keep the site out of the
   cache or re-render the message on a hit. Test: two identical `createValidateFn<symbol>()` calls, scanned in
   both orders, name the same site; a cache hit after an edit names the right site.
5. NEW: **`mion compile` prints the real message.** It prints `FormatDebug` (no headline, `main.go` ~662-737).
   Print the same line shape as the build plugin, headline included. Test: `test/compile-cli.test.ts` checks
   the headline.

#### Linter (`packages/devtools/src/lint/`)

6. **Three level rules, one plugin.** `diagnosticRouting.ts` shrinks to: Error + RuntimeError to `mion/error`,
   Warning + downgraded to `mion/warning`, Info to `mion/info`. `index.ts`: default export `{meta: {name:
   'mion'}}` with those three plus `enforce-type-imports`; `mionPlugin` goes away; `configs.recommended`
   registers `mion`. `settings.runtypes` becomes `settings.mion` and loses `levels` (turn on `mion/info`
   instead); messages lose the `[runtypes]` prefix for `[mion]`. Engine errors report under `mion/error`.
   Update `oxlint-recommended.json`. Tests: rewrite `test/eslint/routing.test.ts` (catalog guard becomes "each
   level goes to its rule"), `plugin.test.ts`, `e2e-lint-settings.test.ts`, the real `oxlint-e2e.test.ts` and
   `eslint-e2e.test.ts`; add an oxlint run that reports an MRT code (route findings never reached oxlint).
7. **Only the linted file's findings.** The report loop (`index.ts` ~125) skips a finding whose site is another
   file (the Go fix in 1 already filters; this guards the other whole-program codes). Test: real oxlint run on
   `a.ts` with an OVR pair across `a.ts` / `b.ts`.

#### Build (`packages/devtools/src/core/unplugin.ts`)

8. NEW: **webpack, rspack, esbuild and bun builds never stop.** Their build-start context has no `warn` or
   `error` (unplugin 3.3.0), and every call is `ctx.warn?.()`, so findings vanish and the build passes. Fall
   back to `console.warn` and throw when `error` is missing. Test: a real esbuild build with an Error fails;
   buildStart with a context that has no warn/error throws and prints.
9. **Build prints everything, then stops once, with the real error.** Today the Error pass halts before
   RuntimeErrors and Warnings print (~925). One pass prints all, then one halt naming the first error's code
   and place (not "unsupported-type errors", ~1136), passed as `{message, id, loc}` so the Vite overlay shows
   it (column is 0-based, not remapped through another file's sourcemap). Tests: `downgrade-errors.test.ts`,
   `test/vite/buildFailure.spec.ts` checks the error object carries `loc`.

#### Dev server

10. **One dev reporter** (new small module in `src/core/`, used by `applyHotUpdate`, transform, the batch
    watcher, and buildStart when `isDevServer()`; vite dev and next dev):
    - Error: printed and thrown so the overlay shows it. RuntimeError: printed. Warning / Info: one count line
      per batch, `mion: N warnings, your editor shows them through the mion lint rules`.
    - Each finding once per session, keyed on code + args + site; forgotten when gone so it prints again.
    - Takes findings from `scanFiles` AND `generate` (`applyHotUpdate` ~824 drops generate's today, so VL003 is
      lost after an edit), and the transform re-sync result (~476, dropped today).
    - Prints through the dev server logger with `clear: false`, one block per batch (Vite 8 clears on every
      plugin warn).
    Tests: a real `createServer` test (pattern: `test/vite/sfcTransform.spec.ts`, `client-tsconfig-refresh.test.ts`)
    with a capturing custom logger: no warning lines, one count line, an added VL003 printed once after an edit,
    an added Error printed once, re-added after a fix prints again.
11. **The generated folder stays put.** `seedOverlay()` (~727) walks the whole project, so `vite.config.ts`
    becomes a checker root and the inferred folder climbs from `src/.mion` to `./.mion`. Fix: seed only files of
    the tsconfig program, and in Go infer the folder from the tsconfig file list, not the overlay roots
    (`generate.go` `inferSrcDir`). Test: a project with no `genDir`, `vite.config.ts` at the root and
    `include: ["src"]`: after a hot update, output is still `src/.mion`, no `./.mion`.

#### Cleanup and repo wiring

12. **Stale comments**: the `$tsc` problem-matcher claims (unplugin.ts ~837, ~1115, ~1147, ~1155; protocol.ts
    ~395, ~417; Go `protocol.go` ~199 which names a missing `FormatTsc`, `catalog.go`, `downgrade.go`; the tests
    listed in the todo), the removed socket client comments, `protocol.go` ~82-87 (MRT005 is a Warning).
13. **Repo configs**: root `.oxlintrc.json` and `scripts/core/oxlint-directives.json` use the `mion/*` rules;
    `lint-directives.mjs` and a new check for the enrichment codes run oxlint `-f json` and fail on the codes
    this repo treats as errors (EXP/DWN; FT020/MD020/FT021/.../GE codes, the set the old rules raised);
    `repo-contracts.test.ts` pin updated. `eslint.config.js`: `mion` plugin; its per-topic test-file overrides
    become `@mion-expect-error` comments or dropping mion rules on test files. `eslint-disable
    @mionjs/...` comments in `private-*` packages become `@mion-expect-error MRT00x`. Pre-publish e2e configs
    (`build-vite/oxlintrc.e2e.json`, `smoke-esbuild/eslint.config.mjs`, `mion-consumer/lint/*`,
    `lint-transport` tests) follow.

### Docs

- `container/website/content/01.rpc/06.devtools/01.linter.md` and `02.runtypes/04.tooling/01.linting.md`: rules
  section rewritten for the three level rules; say they are not normal lint rules (same three in every app, no
  per-check config; change a finding with the comments or the tsconfig `downgradeErrors`, which change editor
  and build together); the linter reads the tsconfig `downgradeErrors`, the plugin option is build-only;
  `mion/info` replaces `levels`; `enforce-type-imports` is the one normal rule; config examples updated.
  Also `01.rpc/02.server/06.error-handling.md` (disable comment), `01.rpc/06.devtools/02.vite.md` (ESLint
  Rules section), `02.runtypes/01.introduction/04.configuration.md` (levels row).
- `02.runtypes/08.diagnostics/01.error-levels.md`: new "Where You See Each Finding" section (editor, dev
  terminal, overlay, build) with the dev print-once and count line.
- `packages/private-examples/src/introduction/eslint-rule-test.routes.ts` rule headings.
- `CLAUDE.md` (two-namespace lines 41, 169), `packages/devtools/CLAUDE.md`, `packages/devtools/src/lint/CLAUDE.md`
  ("Adding a rule" becomes "Adding a code"), `SETUP.md` (`settings.runtypes`).
- Changelog: no Unreleased section exists (sections are written at release), so the rename goes in the commit
  subject as `feat(devtools)!:` with the old-to-new mapping in the body, which git-cliff picks up.

No fuzzing: this is a fix, and there is no cheap oracle beyond the tests above.

### Finish

- Gate: `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm test` (or `pnpm run test:ci`),
  `pnpm run lint`, `pnpm run format`.
- Reproduction project from the todo: no cross-file lint findings, same level in editor and build for a
  tsconfig-lowered code, one count line and no warning lines in dev, VL003 after an edit, each finding once,
  no `./.mion`, the overlay showing the real error, esbuild build failing on an Error.
- Append this plan to the todo, reconcile it with what shipped, `git mv` it to `docs/done/`.
- docs-simplifier and comments-simplifier subagents in parallel, each committed on its own.
- PR labels at open: `website`, `pre-publish-e2e`. No PR is opened unless you ask.

## What shipped (2026-09-29)

Every item above landed except the old-rule-name hint, with these differences from the plan:

- **Four lint rules, not three.** One rule per level, matching the catalog exactly: `mion/error`, `mion/runtime-error`,
  `mion/warning`, `mion/info`. Error and RuntimeError first shared `mion/error`, which made the linter the one
  place where the four levels did not map one to one.
- **Dev server.** It never stops on a finding, a fatal Error included: the dev reporter prints each Error and
  RuntimeError once, and the transform of a file with a fatal Error throws it, which puts it in the overlay. That
  includes an Error only generate finds (MET002): the reporter keeps the last list's Errors per file. A
  dev server's build start no longer halts (it used to, which kept the server from starting). Info never prints
  in dev; Warnings and lowered errors give way to one count line when a new one appears. The reporter reads
  generate's list, which now holds every file's scan findings, so it can forget what is gone.
- **Linter settings.** `settings.runtypes` still works for one release with a rename warning; its `levels` key
  is gone and the tsconfig `levels` key no longer reaches the linter (turn on `mion/info`). The scanFiles
  `levels` echo was removed with it.
- **Directive judging.** A comment naming codes is judged per code (the catalog's `Raised` bits:
  `RaisedWholeProgram`, `RaisedBundleApi`). A bare comment is judged only by a pass that can raise every code,
  so neither the build nor the linter calls one unused any more; the docs already say to always name the code.
- **Whole-program findings.** generate and dump also report OVR findings and CFG002 (anchored at the first
  program file), and the scan findings are kept per file, so a file a scanFiles call reached first is reported.
- **Generated folder.** Fixed on the Go side only: the inferred folder follows the tsconfig's file list, never
  the current Program's roots. `seedOverlay()` still roots every project file.
- **Linter file filter.** Lives in `anchoredIn` (`diagnosticRouting.ts`), unit tested; the end-to-end test
  covers the override pair.
- **Runtime error call site.** The site is sorted, spelled relative to the project, and the message says how
  many other call sites share the entry; alwaysThrow entries are no longer disk-cached (format v18).
- **This repo's lint.** `.oxlintrc.json` raises `mion/warning` to an error, `lint-directives.mjs` fails on the
  EXP/DWN codes from oxlint's JSON output, `**/test-fixtures/**` is ignored, and the ESLint spec-file override
  turns the mion rules off. `eslint-disable @mionjs/...` comments became `@mion-expect-error MRT00x`. No separate
  enrichment-code check: raising `mion/warning` to an error covers those codes and every other Warning.
- **No old-rule-name hint.** oxlint and ESLint reject a config naming an unknown plugin (`Plugin 'runtypes' not
  found`) before any plugin code runs, so no host lets the plugin say more.
- **Changelog.** No unreleased section exists, so the rule rename is the body of the `feat(devtools)!` commit,
  which the release changelog curator reads.
- Items 6 and 13 shipped as one commit: the repo's own lint breaks between the rename and its configs.

Found on the way and fixed here: webpack, rspack, esbuild and bun builds never stopped on a finding; `mion
compile` printed raw debug lines; the disk cache froze a runtime error's call site; generate lost the findings of
files a scanFiles call reached first; the mion route checks never reached oxlint. The review added: an engine
failure went unreported when a config turned `mion/error` off; a failed regenerate in dev hid the edit's
findings; vite's edit path absorbed a file of the separate batch-source project into the server's sources.
