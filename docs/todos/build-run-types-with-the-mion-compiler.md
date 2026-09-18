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
