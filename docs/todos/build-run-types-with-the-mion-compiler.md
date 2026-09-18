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
  (`ts-go-runtypes/internal/cachegen/purefnindex/`): a package's built JS is read first (entry
  tuples plus `registerPureFn(<tuple>, '<id>')` registrations, matched by shape), and its
  sources only when the built files carry no tuple. run-types is on the source lane today only
  because its tsc-built dist is hollowed and holds nothing to read. Once its dist carries the
  tuples, the index reads them with no compiler change, `purefnids.SourceFiles` and `src` in the
  package's published `files` can go, and the CFG004 lane for missing sources goes with them.
- The tuples must land in files the package entry does NOT import. A consumer's bundler follows
  imports, so tuples in the entry's own chunk put the ~11 KB the hollow step keeps out of every
  consumer bundle straight back in. A sibling directory the index scans (any non-hidden dir under
  the package root, `dist/pf/` say) that nothing imports keeps both: the compiler serves from it,
  the bundler never sees it. Hidden dirs are skipped by the index on purpose (a consumer's `.mion`
  holds served copies of other packages' rows), so not there.

Still to establish:

- Whether `scripts/core/hollow-builtin-purefns.mjs` becomes redundant under a real
  mion build, or is still needed.
- Whether the resolver can take the `source` export condition road that run-types'
  own tests already rely on.
- How `scripts/core/build.mjs`'s marker-dist / plugin-dist ordering has to change.

Then propose concrete roads with their costs. Candidates: point the Go fixture
overlay at `src` (or at the `source` condition) instead of `dist`; or a two-stage
bootstrap where tsc seeds once and the real build follows. Recommend one.

Finish by stating plainly whether devtools must stay tsc-built, and why. The
expected answer is yes, it is the plugin, but establish it rather than assume it.

The implementer plans the details; this doc sets direction only.

## Done when

- A written answer separating hard constraints from historical accidents, each
  backed by the code that proves it.
- A recommended road for building run-types with the mion compiler, with its cost,
  or a clear statement of the specific constraint that makes it not worth doing.
- An explicit verdict on whether `pure-fn-ids.generated.ts` and the hollowing step
  survive.
- An explicit verdict on devtools.
