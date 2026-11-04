---
type: fix
spec: guidelines
status: done
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

## Plan: cache key from the program (approved 2026-11-04)

- Go `OpGenerate` returns `programHash`: sha256 over every program source file (name + text, `.d.ts` included),
  the tsconfig chain texts and the binary version.
- Plugin core: `configureVitest` on the vite / rollup / rolldown blocks registers a key generator
  (`defineCacheKeyGenerator`, Vitest 4's `experimental_defineCacheKeyGenerator`). A file the transform gate
  passes gets `programHash` + generated module list + site files + resolved options; other files add nothing;
  no hash yet (before the first generate, or during a hot update) returns `false`.
- Vue pass keys `.vue` files with a marker probe through the same function.
- Test: Vitest 5 child process over a temp project, `fsModuleCache` on: change `include`, expect the new output;
  unchanged rerun still reads the cache. Root dev dep alias `vitest-5` (5.0.3, oldest-enough release).
- Docs: one note under "Client Tests" on the Vite plugin page.

## What shipped

- `programHash` covers the binary version and build stamp (`binaryStamp`: a dev build is always `dev`), the root
  tsconfig text (the only file the mion plugin block is read from), the resolved compiler options (what an
  `extends` chain contributes) and every program file's name and text. A read or encode error sends no hash.
- The plugin key is `programHash` + generated module list + site files + batches module + the plugin options
  as JSON (callbacks drop out). It is set at buildStart's generate. A real edit clears it until its generate;
  a Vue SFC script registered under its virtual `Comp.vue.ts` path is no edit and keeps it.
- The Vue pass registers its own generator: a `.vue` id whose text passes the marker probe gets the core digest
  through `rtCacheDigest`.
- The end-to-end test runs the repo's Vitest 4 with `experimental.fsModuleCache` (same cache, same key hook
  under its `experimental_` name), not Vitest 5: a root `vitest-5` alias dependency was tried and dropped, its
  `vitest` bin replaced the repo's own and the whole suite ran on Vitest 5. It checks the `include` change, a
  type edit in another file, an unchanged rerun reading every entry back, and both marker call shapes.
- Vitest 5.0.3 and 5.1.0 were checked by hand on the same fixture: stale before the fix, correct after.
- The test fails without the key generator, at the `include` step.
- The "Not checked" list: batch ids and pure-fn ids come from whole-program scans, so the program hash covers
  them; `downgradeErrors` comes from the plugin options or the tsconfig text, both in the key; enrichment
  mirrors are `.ts` files the app imports, keyed by Vitest on their own text and hashed as program files.
