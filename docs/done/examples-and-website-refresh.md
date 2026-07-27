# Examples + website refresh (deepkit/AOT-era API sources)

**Status:** done — examples ported off the removed factories and the website refreshed off the
deepkit/AOT surface (PR #125).
**Created:** 2026-07-15
**Updated:** 2026-07-27 (split out of the retired `docs/partially/`)

## Problem (as filed)

`packages/examples/src/` contained sources written against the deepkit-era `@mionjs/run-types`
API that no longer exists on `@ts-runtypes/core` — the `create*Fn` value-level factories were
dropped upstream in ts-runtypes `eb7b618` (already in 0.9.1). CLAUDE.md promises the examples
package "should compile", so this was real doc drift. The website content likewise still showed
deepkit / `mion-build-aot` APIs.

## What shipped (PR #125)

- Examples ported off every removed factory to the sync API; obsolete AOT/pure-fn examples deleted;
  website refreshed off the deepkit/AOT surface (AOT page deleted; pure-functions/vite-config/
  cloudflare/type-formats pages rewritten; all `code-import` paths re-pointed).
- **`codegen/vite-client-ipc.config.ts` was NOT deleted — it was renamed to `vite-client.config.ts`.**
  Its old IPC/AOT-metadata rationale is gone, but the file was already rewritten to the current
  `server: {runMode: 'childProcess'}` managed server (spawn + TCP port-poll → `serverReady`), which is
  a live plugin feature for client e2e/dev (NOT metadata — that comes from router types). The "ipc"
  name and framing were corrected and the website vite-config page now scopes it as optional/e2e.
- A `check-types` script + `tsconfig.check.json` were added, but a fully-green typecheck GATE is NOT
  wired: the examples carry substantial pre-existing, non-migration debt (placeholder-import doc
  snippets, friendly-errors format-param rework, source-package strict-check issues). That debt +
  the remaining CI-enforcement item are tracked in [examples-precompile-debt.md](../todos/examples-precompile-debt.md).

## What did NOT ship, and where it went

- **A green typecheck GATE.** `check-types` + `tsconfig.check.json` exist but are not wired as a
  gate: the examples carry substantial pre-existing, non-migration debt. Tracked in
  [../todos/examples-precompile-debt.md](../todos/examples-precompile-debt.md).
- **The 2026-07-22 proxy-removal wave.** After this refresh, `@mionjs/run-types` and
  `@mionjs/type-formats` were deleted, leaving a second round of website drift (deleted-package
  references, old `Format*` names, the removed `type-formats-imports` rule and its fixtures).
  Tracked with verified file counts in
  [website-stale-package-references.md](website-stale-package-references.md).
- **Friendly-errors docs** ride
  [../todos/friendlyerrors-to-friendlytext-feasibility.md](friendlyerrors-to-friendlytext-feasibility.md).
