---
type: chore
spec: guidelines
status: done
created: 2026-09-18
---

# Build run-types with the mion compiler, not plain tsc

## What this was

`@mionjs/run-types` was the one package whose built-in pure function bodies the compiler
read out of TypeScript sources at build time. That needed a special case on both ends: a
generated file list (`purefnids.SourceFiles`), a marker-only branch in `extractSource`,
`MarkerSourceFiles`, and a `CFG004` error for a pruned install. Every other package ships a
`mion-pure-fns/` directory its own build writes, and the compiler serves from that.

## What actually forced tsc: nothing. The blocker was the compiler

The spec assumed the cause was "it builds with tsc, so no plugin runs". It was not. The
compiler skipped the marker package in TWO places, both deliberate, so adding a plugin to
run-types would have changed nothing at all:

- `resolver/render.go` `collectProgramPureFns` dropped every `purefnids.Has` entry from the
  whole-program graph, so `renderPureFnArtifact` found none of its own to write. The reason
  holds for a CONSUMER: an in-repo consumer resolves run-types through the `source`
  condition, so its extractor would produce a second body for an id the table already serves.
- `resolver/dispatch.go` `extractPureFnsForScan` refuses to rewrite the package's own
  registration call sites, because a rewritten site imports a pure-fn module that is only
  emitted on demand and would dangle otherwise.

Because both filters live in the resolver, the build tool was never the question: a bundler
plugin and `mion compile` drive the same resolver and were equally blocked.

## What shipped

1. **The graph filter lifts for the package that owns the ids.** A memoised
   `sess.ownPackage()` reads the program cwd's package.json, and `collectProgramPureFns`
   keeps the built-ins when that package owns them. `renderPureFnArtifact` already computed
   the same value by hand and now shares it.
2. **The rewrite filter stays.** run-types' own sources compile unchanged, keep their
   explicit ids from `pure-fn-ids.generated.ts`, and `hollow-builtin-purefns.mjs` keeps
   stripping the bodies out of the dist exactly as before.
3. **run-types builds with `mion compile`**, replacing `tsc --build tsconfig.json`. It emits
   the same file set (`.js`, `.d.ts`, `.js.map`, `.d.ts.map`) into the same `dist/` layout
   and writes `dist/mion-pure-fns/` beside it. The CJS pass stays `tsc -p tsconfig.cjs.json`,
   so exactly one artifact copy ships. `@mionjs/bin-compiler` joins the package's
   devDependencies as the CLI the build runs.
4. **The source lane is gone**: the `MarkerPackageName` branch in `extractSource`,
   `MarkerSourceFiles`, `purefnids.SourceFiles` with its generator half, and `CFG004`. A
   marker package with nothing to serve now reports `PFE9016` like any other unbuilt
   dependency, which also removed a clause that forced every built-in onto `PFE9012`.

## Verdicts the spec asked for

- **devtools stays tsc-built.** It IS the plugin: its dist is what a mion build loads, so
  building it with itself is a bootstrap with nothing to gain. Unchanged.
- **`pure-fn-ids.generated.ts` survives.** The transform would have injected those ids, but
  the rewrite filter deliberately keeps run-types' call sites untouched, so the ids still
  have to be written at the call site and this file is where they come from.
- **The hollowing step survives.** It keeps roughly 11 KB of factory bodies out of every
  consumer bundle, and the artifact is what serves them instead. Removing it would put them
  back with nothing gained.
- **`src` stays in the published `files`.** Every published mion package ships `src` for its
  `source` export condition and nothing rewrites the manifest at publish time. The pure
  function bodies no longer depend on it.
- **A vite build was not needed.** `mion compile` is a complete tsc replacement here and cost
  none of what a vite migration would have: `composite: true` is load-bearing for six drizzle
  project references, ten-plus places hard-code `packages/run-types/dist/<path>`, and core's
  vite shape emits CJS as `.cjs` rather than the `.js` this package's export conditions name.

## Known consequence

run-types' build now needs `mion-bin/mion`, like every other mion-built package.
`scripts/core/build.mjs` already builds the binary before the marker dist, so its order did
not change.

## Tests

- `TestMarkerArtifact_HoldsEveryBuiltinID` builds the real package's sources and asserts the
  artifact holds exactly `purefnids.All()`, each module readable.
- `TestMarkerArtifact_ConsumerStillDropsBuiltins` pins that the filter was narrowed, not
  removed.
- `TestBuiltinDelivery_ArtifactServesWithoutSources` and
  `TestBuiltinDelivery_MarkerWithNothingToServeFails` replace the old `CFG004` test.
- `TestMarker_ServedFromItsArtifact`, `TestMarker_WithoutArtifactOrSourcesServesNothing` and
  `TestMarker_ArtifactOnDiskHoldsEveryGeneratedID` replace the source-lane tests.
- `TestMarker_BothLanesAgreeOnIds` now scans for the registration modules instead of reading
  the generated list, which also pins the shipped artifact and the shipped sources to the
  same bodies.
- `repo-contracts.test.ts` gains a block asserting the build runs `mion compile` and that the
  built artifact holds one module per indexed id.
- The marker fixture (`testfixtures/realmarker.go`) now carries `dist/mion-pure-fns/`, since
  that is what the tarball ships.

## Docs

No website change. The pure functions guide documents the generic source fallback for any
package, which this change keeps; the diagnostics page renders from the generated catalog.
