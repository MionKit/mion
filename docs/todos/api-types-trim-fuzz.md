---
type: chore
spec: guidelines
status: blocked
created: 2026-10-03
---

# Fuzz the api-types trimmer: ship everything the API reaches, nothing else

Blocked until MionKit/mion#448 (the `mion api-types` command) is on main.

## Intent

`mion api-types` publishes a types-only package: the `.d.ts` the build emits, trimmed to what the exported API
reaches. Two failures matter, and hand-written cases cannot cover every way a type is named:

- **A leak**: a server-only type, or a heavy package such as `drizzle-orm`, reaches the published package through
  some position the trimmer does not follow (or keeps too much of).
- **A loss**: a type the API needs is dropped, so the client build fails or computes different type ids than the server.

Today's tests (`ts-go-runtypes/internal/compiler/apitypes/trim_test.go`, `drizzle_test.go`) pin the main shapes.
This todo adds a fuzz lane that generates random module graphs and checks both properties on every one.

## Direction

The implementer plans the details. Verified pointers and the shape to aim for:

- **Generator: random module graphs, labelled by construction.** N files, each declaring types that name each other
  in every position a type can appear: property and index signature types, generic arguments and defaults, `extends`
  / `implements`, function params and returns, unions, conditional and mapped types, `typeof` / `keyof`,
  `import("x").Y` types, namespaces, overloads, declaration merging, `declare module` / `declare global`, re-exports,
  `export *`, aliased imports. Routes, public middlewares, private and raw middlewares, and other exports pick some of
  those types. Every type is labelled when generated: reached from `api` (must ship) or not (must not). Unreached
  types carry a unique poison name and import from a fake heavy package, so a leak is a plain text search.
- **Oracles** (each proved by breaking the output on purpose and watching it fire):
  1. No leak: no poison name and no import of the heavy package in the output; the heavy package is not a peer.
  2. No loss: the output type-checks on its own (`Check` in `apitypes/trim.go`), and the client's ids and build
     version equal the full server's (the `apiids` lane already compares these, both `getRunTypeId` call shapes).
  3. Idempotent: trimming the output again changes nothing.
  4. Deterministic: the same seed gives byte-identical output.
- **Where it runs.** Reuse what exists: the seeded rng and run loop under `packages/run-types/test/fuzz/core/`,
  the `apiids` lane (`packages/run-types/test/fuzz/apiids/`) for the real-binary client build, and the stub router
  setup in `trim_test.go` if a fast Go-side generator fits better. Register the lane like the others
  (`pnpm miondevx core fuzz <suite>`, `scripts/lib/devx-registry.mjs`) with a quick tier and the soak tier. Follow the
  fuzzy-testing skill and the "real types, never copies" rule in `packages/run-types/test/fuzz/README.md`.
- **A real app, once.** Besides random graphs, run the trimmer on `packages/private-drizzle-example-app` and check
  oracles 1 and 2: no `drizzle-orm` import ships, and the client ids match.
- **Every finding is a fixed bug plus a seeded regression test** in `trim_test.go`, never a skipped seed.

## Docs

None unless a fix changes what the package ships; then update the existing section "Publishing a Types-Only Package"
in `container/website/content/01.rpc/07.devtools/04.cli.md`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- The lane generates graphs using every position listed above, and each oracle has been shown to fire on a
  deliberately broken trimmer.
- The quick tier runs in CI with the other fuzz lanes; the soak tier runs in the release fuzz workflow.
- The drizzle example app passes oracles 1 and 2.
- Every finding is fixed with its own regression test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
