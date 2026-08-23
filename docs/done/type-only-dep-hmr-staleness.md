# Editing a type-only dependency no longer leaves compiled fns stale

**Status:** done — the mion side shipped on `claude/ts-runtypes-upstream-todos-s1dbu4`, against the
upstream fix specced in ts-run-types as
[`docs/todos/unified-type-dependency-invalidation.md`](https://github.com/MionKit/ts-run-types/blob/main/docs/todos/unified-type-dependency-invalidation.md).
**One piece is deliberately NOT here:** raising the exact-pinned `@ts-runtypes/*` version, which
cannot happen until that fix is released. It is tracked in
[../todos/upstream-allsingle-import-grouping.md](../todos/upstream-allsingle-import-grouping.md),
which was already waiting on the same bump.
**Created:** 2026-08-22 · **Completed:** 2026-08-23

## The bug

In `vite dev`, a marker's compiled fns are injected when the _using_ module is transformed. If the
type it reflects lives in another file and the import is erased (`import type`, or a plain import
used only in type position), vite has no module-graph edge from the user to the type file, so
nothing invalidates the using module when the type changes. The dev server kept serving the
previously injected fn, validating the OLD shape, until the using file was touched or the server
restarted. It never errored: it accepted data the current type rejects.

Measured side by side, `.ts` and `.vue` behaved identically, so the trigger was the erased edge and
not the file kind:

```
plain .ts before edit                       __rt_nPZ_BfJXPb5
edit models.ts (add a property) → re-fetch  __rt_nPZ_BfJXPb5   ← unchanged, stale
SFC after touching the SFC itself           __rt_nPZ_tb1XjRd   ← new type, correctly re-injected
```

Dev only: `vite build` transforms every module in one pass and vitest transforms fresh per run.

## What shipped

Upstream now reports which site files went stale after an incremental update, through an
`onSiteFilesChanged` callback. mion's half is the translation and the invalidation:

1. **A virtual → real map** (`createVirtualSiteMap` in
   `packages/devtools/src/vite-plugin/sfcTransform.ts`). mion registers an SFC's script under a
   VIRTUAL path (`Comp.vue.ts`) while the module vite serves is `Comp.vue`, so invalidating by the
   reported path alone would hit nothing for SFCs — `.ts` files would recover while `.vue` files
   stayed stale. The map is built before the ts-runtypes plugin is constructed, because the plugin
   takes the handler and the SFC pass fills the map, so neither can own it.
2. **The handler** (`invalidateStaleSites` in `mionVitePlugin.ts`), passed as `onSiteFilesChanged`.
   It maps each reported site file through the virtual map and invalidates the resulting module in
   vite's graph. A small `mion-rt-invalidate` plugin captures the dev server via `configureServer`;
   build lanes never call it, and a single transform pass makes staleness impossible there anyway.
3. **The delegation contract was re-verified.** mion's SFC pass calls upstream's `handleHotUpdate`
   with a fabricated context (`{file, read, modules: [], timestamp: 0}`). The upstream fix added
   module-graph invalidation inside that hook, but it reads `ctx.server?.moduleGraph` and
   `ctx.modules ?? []` defensively, so the fabricated context still works unchanged.

## Test

`packages/devtools/src/vite-plugin/sfcTransform.spec.ts` → "type-dependency invalidation". It runs a
real dev server, requests `/src/Setup.vue`, edits the `User` type in `src/models.ts`, emits the
watcher event, and re-requests the SFC **without touching it**. The injected `__rt_…` id must
change.

Confirmed to catch the original bug: against the pre-fix `@ts-runtypes/devtools` the test fails with
`expected 'nPZ_M8U0CGo' not to be 'nPZ_M8U0CGo'` — the same id served twice, which is exactly the
stale validator.

## Notes for the bump

An upstream defect surfaced while verifying this and was fixed there: a type declared inside a
virtual source was reported as a dependency on the virtual path, and vite's dev-mode
`addWatchFile` treats what it is given as an extra IMPORT of the module being transformed, so it
failed the request with `Failed to resolve import "…/Comp.vue.ts"`. Upstream now filters deps that
do not exist on disk. Any `@ts-runtypes/*` version mion pins must include that fix, not just the
invalidation itself.
