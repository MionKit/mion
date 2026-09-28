---
type: fix
spec: guidelines
status: done
created: 2026-09-27
---

# The linter skips files that only call drizzle's `tableFromType<T>()`

## Intent

The linter only sends a file to the resolver when a cheap text check says it can hold a marker call. That
check (`referencesMarkerModule` in `packages/devtools/src/lint/prefilter.ts`) looks for a quoted
`@mionjs/run-types` import, a configured marker package, or `registerPureFn`. A file that calls
`tableFromType<T>()` imports only a `@mionjs/drizzle-orm-*-core` package, so the linter never checks it.

The build does check those files. So a broken `tableFromType<T>()` fails the build but never shows in the
editor, and the editor and the build disagree, which the lint design promises never happens.

Found while counting diagnostics on the drizzle e2e trees (`pnpm miondevx core drizzle-translate --to-types
--keep`, written to `.cache/drizzle-suites/`): with the default gate all six tree files were skipped. Forcing
the gate open found nothing wrong there, so no current error is hidden, only future ones.

## Direction

- Find how the build admits these files (the Go-side marker gate and `--marker-packages`,
  `packages/devtools/src/core/resolver-client.ts`) and make the lint gate agree with it, so the two can never
  drift. Hard-coding the drizzle package names is the fallback, not the goal.
- A test in `packages/devtools/test/eslint/prefilter.test.ts` for a file importing only a dialect package,
  plus one lint run proving a broken `tableFromType<T>()` is reported.

The implementer plans the details.

## Docs

`container/website/content/01.rpc/06.devtools/01.linter.md`: only if the fix adds or changes a setting (for
example `settings.runtypes.markers`); otherwise none, because the linter already promises to check every
marker file.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A file that only imports a drizzle dialect package and calls `tableFromType<T>()` gets linted, pinned by tests.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.

## Plan (approved 2026-09-28) and what shipped

The build's real gate is the resolver's whole-program scan (`gen.siteFiles`), which finds marker calls by type.
The lint session has no such scan (one inferred program per file), so it keeps a text gate. Sending every file to
the resolver was measured and rejected: 60 to 1350 ms per file (about 300 ms typical) even with no marker calls,
against well under 1 ms for the import check.

- **One shared gate**, `mayHoldMarkerCalls` in `packages/devtools/src/core/markerImports.ts`, used by the lint
  pre-filter (`referencesMarkerModule`, `needsResolverPass`) and by the build transform's fallback for files
  outside the site set. The old copy in `unplugin.ts` (`markerImportProbes`) is gone, so the two cannot drift.
- On top of the old checks (quoted marker package, `registerPureFn`, `checkPackage: false`), it follows imports:
  - a bare import whose `package.json` lists a marker package in `dependencies`, `peerDependencies` or
    `optionalDependencies` (found through `node_modules`, or a package importing itself by name). The drizzle
    dialects peer-depend on `@mionjs/run-types`, so they match with no setting.
  - a relative import (user decision: local wrappers too) whose file passes those direct checks, one import deep.
- Caches: package verdict per `package.json`, lookup hits per `(dir, package)` (misses are not cached),
  local file verdict per `(path, mtime)`.
- Limits: a wrapper two files away, or behind a tsconfig `paths` alias, is not followed.
- No setting added, so no docs change.

Tests: `test/eslint/prefilter.test.ts` (package deps of each kind, the real repo dialect, local wrapper
spellings, one-level limit, mtime refresh, per-file cache key), `test/eslint/plugin.test.ts` (a real lint run
reports `MKR003` on `tableFromType<T>()` imported from a dialect package and through a local wrapper; both fail
on the old gate), `test/wrapper-zero-config.test.ts` (the build transform asks the shared gate for a file outside
the site set).

Also fixed on the way: the lint test fixtures (`test/eslint/fixture.ts`) shipped a hand-written copy of the
marker typings; they now install the real built `@mionjs/run-types` like every other devtools fixture.
