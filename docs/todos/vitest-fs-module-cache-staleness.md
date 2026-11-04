---
type: fix
spec: guidelines
status: ready
created: 2026-11-04
---

# Vitest 5's on-disk module cache serves stale mion transforms

## Problem

Vitest 5 turns on `fsModuleCache` by default: transformed modules are stored in `node_modules/.vitest-cache` and
reused across runs. Its key is the module id, the file's own text, the plugin names and the Vite config file text.
mion's transform output also depends on state outside the file: the tsconfig program (which files it holds, its
options). Change that state and Vitest keeps serving the old output.

Seen in the mion-starters Nuxt starter (Vitest 5.1.0, mion main):

1. `tsconfig.mion.json` included `api/src` but not `api/tests`; `vitest run` cached `api/tests/client.test.ts`
   without the mion transform (the file was outside the program).
2. Adding `api/tests/**/*` to the tsconfig `include` changed nothing: every client test kept failing with empty
   results and `inputFrom() requires the mion build plugin: no pure-fn id was injected at build time`.
3. A byte-identical copy of the test under a new name passed. `rm -rf node_modules/.vitest-cache` fixed it.

Editing a route's param type in another file was picked up, so the type-id path itself looks safe. Not checked:
batch ids, pure-fn ids, enrichment, `downgradeErrors` and other options that change the output.

## Direction

- mion's Vite plugin hooks `configureVitest` and calls `defineCacheKeyGenerator`: for files it transforms, add a
  digest of the program state (tsconfig chain text, program file list, plugin options), or return `false` to bail
  out of the cache when that is cheaper. Cover both the vite plugin and the runtypes plugins that Vitest can load.
- Test with Vitest 5 and `fsModuleCache` on: run once, change the tsconfig `include`, run again, expect the new
  output. mion's own repo pins Vitest 4, so the test needs a Vitest 5 fixture.
- Document the limit on the Vite plugin page if any state stays outside the key.
