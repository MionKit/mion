---
type: chore
spec: guidelines
status: ready
created: 2026-09-18
---

# Build run-types with the mion compiler, not plain tsc

## Intent

Two packages opt out of the mion build: `@mionjs/run-types` and `@mionjs/devtools`.
Every other package builds with `vite build` + `mionVitePlugin`. Only devtools has a
real reason to stay out. run-types is tsc-built for reasons that look historical
rather than forced, and the cost is visible: its own pure-fn registrations get no id
injected, so a generated id module has to exist and be imported by hand, and a
post-build step has to strip bodies the compiler would never have inlined.

Find out what actually forces tsc there, and remove what does not.

## Direction

The bootstrap loop usually given as the reason is soft. The Go resolver's test
fixtures overlay the marker package by walking `packages/run-types/dist` and reading
ONLY `.d.ts` files (`ts-go-runtypes/internal/testfixtures/realmarker.go`). The
dependency is on run-types' declarations, not its compiled JavaScript, and
`vite-plugin-dts` already emits declarations for the vite-built packages. Start
there, and treat "it needs dist" as a claim to test, not a constraint.

Already verified, so do not re-derive:

- run-types has NO marker call sites of its own (no `createValidateFn<T>()` and
  friends in its `src`, only JSDoc prose). The transform's job there would be
  pure-fn id injection and nothing else.
- Six files under `packages/run-types/src` carry `registerPureFn` /
  `registerPureFnFactory` calls. Those are what `pure-fn-ids.generated.ts` feeds. If
  the transform ran, it would inject those ids and that generated module could
  likely go away. Confirm and say so.
- Dual ESM + CJS emit is NOT tsc-only: `@mionjs/core` ships both through its vite
  build. `tsconfig.cjs.json` + `emit-cjs-pkg.mjs` are not by themselves a reason.
- `@mionjs/devtools` imports `@mionjs/run-types` only in a spec file, never in
  `src`; its one workspace dependency is `@mionjs/bin-compiler`. Factor that in
  before asserting any cycle.

Already in place, so build on it rather than around it:

- The compiler serves every installed package's pure fns through one lane
  (`ts-go-runtypes/internal/cachegen/purefnindex/`). It reads a BUILT ARTIFACT first: a
  `mion-pure-fns/` directory under the package root, holding `index.json` plus one cache
  module per id (`constants.PureFnArtifactDir` / `PureFnArtifactIndexFile`). Only a package
  with no artifact falls back to extracting from its shipped TypeScript.
- The artifact is written by the build itself. The resolver renders the pure fns OWNED by the
  package at the program cwd (`renderPureFnArtifact`, `render.go:346`) and the plugin syncs
  them next to the bundle (`writePureFnArtifact`, `unplugin.ts:887`). So building run-types
  with `mionVitePlugin` produces the artifact with no compiler change.
- run-types is on the source lane ONLY because tsc runs no plugin, so no artifact is ever
  written. That is the whole reason `purefnids.SourceFiles`, the marker branch in
  `extractSource` (`purefnindex.go:377`), `MarkerSourceFiles`, the CFG004 diagnostic and `src`
  in the package's published `files` exist. Every one of them goes once the artifact ships.
- Resolution from `node_modules` already works today (`ResolvePackage` walks up to
  `node_modules/@mionjs/run-types` and reads its `src`). This is a cleanup of a special case,
  not a fix for something broken. Nothing may regress for a consumer at any point.
- The artifact dir must be reachable by the index walk, which skips `node_modules` and ANY
  directory whose name starts with a dot (`walk`, `purefnindex.go:287`). run-types outputs to
  `dist/`, so it is fine; the other mion packages output to `.dist/`, which the walk would
  skip. None of them owns a pure fn today (`@mionjs/core` routes around the registrar on
  purpose, see `inputMappers.ts:67`), so nothing is broken, but do not copy their outDir.
- The artifact modules are not imported by the package entry, so a consumer's bundler never
  follows them. That is what keeps the ~11 KB the hollow step removes out of consumer bundles,
  which is why the hollow step itself should become redundant rather than move.

Still to establish:

- Whether `scripts/core/hollow-builtin-purefns.mjs` becomes redundant under a real
  mion build, or is still needed.
- Whether the resolver can take the `source` export condition road that run-types'
  own tests already rely on.
- How `scripts/core/build.mjs`'s marker-dist / plugin-dist ordering has to change.
- Whether `src` can leave run-types' published `files` outright, or whether the `source`
  export condition still needs it for a consumer.

Then propose concrete roads with their costs. Candidates: point the Go fixture
overlay at `src` (or at the `source` condition) instead of `dist`; or a two-stage
bootstrap where tsc seeds once and the real build follows. Recommend one.

Finish by stating plainly whether devtools must stay tsc-built, and why. The
expected answer is yes, it is the plugin, but establish it rather than assume it.

The implementer plans the details. The order below is not a detail: it is the
only order that keeps every install working at each commit.

## One pull request, in this order

The three steps below are one change. Shipping the artifact without removing the
special case leaves two live paths for the same ids; removing the special case first
breaks every install. Neither half ships alone.

1. **Build run-types with `mionVitePlugin`**, so its build emits `dist/mion-pure-fns/`
   (`index.json` plus one module per built-in id). Keep the output dir un-hidden.
   Verify the emitted ids match `purefnids.All()` exactly: an id is a hash of the body,
   so a mismatch means the artifact and the compiler disagree on what a built-in is.
2. **Delete the marker special case in the compiler**: the `idx.Name == MarkerPackageName`
   branch in `extractSource`, `MarkerSourceFiles`, the `SourceFiles` block in
   `ids.generated.go` and its generator half, and the `CFG004` diagnostic. Keep the rest
   of `purefnids`: `Has()` and the named constants are how an emitter tells a built-in id
   from a consumer's own, and how `usePureFn` names one.
3. **Drop what the artifact makes dead**: `src` from run-types' published `files` (if the
   `source` condition question above allows it), `scripts/core/hollow-builtin-purefns.mjs`,
   and `pure-fn-ids.generated.ts` if the transform now injects those ids.

## Done when

- A written answer separating hard constraints from historical accidents, each
  backed by the code that proves it.
- run-types builds with the mion compiler and ships `dist/mion-pure-fns/`, or a clear
  statement of the specific constraint that makes it not worth doing.
- The compiler has no marker-package branch left: a built-in body is served the same way
  any other installed package's is.
- An explicit verdict on whether `pure-fn-ids.generated.ts` and the hollowing step
  survive.
- An explicit verdict on devtools.
- The `pre-publish-e2e` lane passes, proving a consumer installing the real tarball still
  gets every built-in body. This is the gate that catches a pruned artifact, so the PR
  carries the `pre-publish-e2e` label.
