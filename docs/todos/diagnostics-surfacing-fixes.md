---
type: fix
spec: guidelines
status: ready
created: 2026-09-28
---

# Fix how diagnostics reach the user: build, dev server and linter disagree

## Intent

One Go checker produces every diagnostic, and two hosts show them: the build plugin (`vite build`, `vite dev`,
every bundler adapter, the Next broker) and the lint plugin (oxlint / ESLint, editor and CLI). Research with a
real Vite project running the mion plugin plus the shipped oxlint preset found that the two hosts disagree in
several places, and that `vite dev` loses real errors. Each bug below needs its own fix, commit and test.

Design context, already decided: the build and the linter both reporting the same finding is expected (the
build prints to the terminal and CI, the linter to the editor and CI). Do NOT add a per-code "lint only" flag
(Info plus `levels`, and the opt-in lint families, already cover it) and do NOT share one checker process
between the dev server and the linter (new protocol, discovery and CI fallback for little gain).

## The bugs

Line numbers are from when this was filed; confirm them first. The implementer plans each fix.

1. **The linter reports another file's override findings in the current file.** `scanFiles` appends the
   whole-program `sess.overrideDiagnostics` to every response (`ts-go-runtypes/internal/compiler/resolver/dispatch.go`
   ~597 and ~948), and the lint report loop (`packages/devtools/src/lint/index.ts` ~119) never checks
   `diagnostic.site.filePath`. Linting `a.ts` reported `OVR001@b.ts:4` and `OVR010@b.ts:3` at `a.ts` positions.
2. **The build handles override findings wrong.** `generate` never includes them (`dispatch.go` ~785-824), so
   the build-start report misses OVR001; `transform` appends them to every file, so dev prints them once per
   transformed file; OVR010 (Info) can never show, even with `levels: 'all'`, because `surfaceNewErrors`
   (`packages/devtools/src/core/unplugin.ts` ~437-445) only takes Error and RuntimeError.
3. **After an edit in `vite dev`, findings are lost.** `applyHotUpdate` (`unplugin.ts` ~781-869) prints only
   the `scanFiles` findings and throws away the `generate` result's, so VL/PJ/RJ and whole-program codes are
   never printed again, and a NEW RuntimeError added while the dev server runs is never reported at all
   (appending `createValidateFn<(a: number) => void>()` reloads the page silently; `vite build` reports VL003).
   The comment at ~855 claims the opposite. Direction: surface `generate`'s findings too, printing each finding
   once per dev session (keyed on code, args and site).
4. **Each dev warning clears the terminal.** Vite 8 logs a plugin's `this.warn` with `clear: true`
   (`node_modules/vite/dist/node/chunks/node.js` ~30452, logger ~307), so in a TTY only the last warning of a
   batch stays visible. Direction: one multi-line warn per batch, or the dev server logger with `clear: false`.
5. **The generated folder moves after the first dev edit.** With no `genDir`, build start writes `src/.mion/`;
   after the first save the dev server writes a second tree at `./.mion/` and imports point there. Cause:
   `seedOverlay()` (`unplugin.ts` ~745) walks the whole project, so root files like `vite.config.ts` join the
   checker's program and its source root changes. Seen with the standard layout (`vite.config.ts` at the root,
   tsconfig `include: ["src"]`); moving the config out of the project makes it go away.
6. **"This comment silenced nothing" (EXP001 / DWN001) fires for comments that are needed.** Directives are
   judged per family (`ts-go-runtypes/internal/diagnostics/expecterror.go` ~249-265, `resolver/expecterror.go`
   ~44-73). The lint pass judges the Marker family but can never raise `MET*` (it runs with `bundleApi: 'off'`)
   or the whole-program `BAT003`/`BAT008`/`BAT009`, so `@mion-expect-error MET006` is flagged unused there; the
   build's `generate` has the same problem for `OVR001` (bug 2). Direction: judge only codes the request can raise.
7. **The halt message is wrong, and the browser overlay never shows the real error.** The build always says
   "N unsupported-type error(s)" (`unplugin.ts` ~1164), even for batch, pure-function, config or bundled-API
   codes, and the Vite overlay shows only that line, never the code or place.
8. **The linter ignores the tsconfig `downgradeErrors`.** The build honours the plugin option and the tsconfig
   echo; the linter only honours the `@mion-downgrade-error` comment (`diagnosticRouting.ts` ~430), so a code
   lowered in the tsconfig is an error in the editor and a warning in the build. The plugin option stays
   build-only (the linter cannot see it); document that.
9. **Stale comments.** Claims that VS Code's `$tsc` problem matcher picks up the build's lines (it needs a
   `TS<digits>` code, and Vite prefixes each line): `unplugin.ts` ~855, ~1145, ~1177; `protocol.ts` ~395;
   `protocol.go` ~200; `pure-fns-cache.test.ts` ~397. A removed socket client: `resolver-client.ts` ~130, ~168,
   ~309, ~338; `lint-worker.ts` ~88; `lint/index.ts` ~84. `protocol.go` ~82-87 says every MRT code is an error
   (MRT005 is a Warning). `packages/devtools/src/lint/CLAUDE.md` says the editor, linter and build never disagree.
10. **A runtime error can name the wrong call site.** Two identical `createValidateFn<symbol>()` calls share one
    generated validator, and its error names whichever call site built it last (`throwProvenance`,
    `ts-go-runtypes/internal/cachegen/typefunctions/walker.go`), switching as files are edited. Direction: a
    stable choice, and say when other call sites share it.
11. **An Error added during `vite dev` prints 3 times** (the edit handler, then the transform's "Pre-transform
    error" and "Internal server error"). Direction: the same print-once set as bug 3.

Optional, decide while planning: in `vite dev` only, print Error and RuntimeError in full and replace the
Warning lines with one count line pointing at the linter; `vite build` and `mion compile` keep printing all.

## How to reproduce

A small Vite project whose `node_modules/@mionjs/{run-types,devtools,router,core,bin-compiler}` symlink to the
workspace packages, `MION_BIN` pointing at `mion-bin/mion`, tsconfig `include: ["src"]` with
`customConditions: ["source"]`, `vite.config.ts` at the root using `mionVitePlugin`, and sources that raise
MKR003, VL002, a downgraded VL002, NE001, UPN001, VL011, an OVR001/OVR010 pair across two files, and MRT001.
Run `vite build`, `vite` (edit and restore files while it runs), and oxlint with
`packages/devtools/oxlint-recommended.json` and `-f json`.

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md` and
`container/website/content/02.runtypes/04.tooling/01.linting.md`: the linter reads the tsconfig
`downgradeErrors`, the plugin option is build-only. `container/website/content/02.runtypes/08.diagnostics/01.error-levels.md`:
the dev server prints each finding once (plus the count line, if picked).

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Each bug above is fixed with its own commit and a test on the real path (Go resolver tests, the build plugin
  hooks, real oxlint / ESLint runs), and the reproduction project shows: no cross-file lint findings, each
  finding printed once in dev, VL003 reported after an edit, no `./.mion`, the overlay showing the real error.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
