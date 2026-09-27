---
type: fix
spec: guidelines
status: ready
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
