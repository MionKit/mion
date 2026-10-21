---
type: chore
spec: guidelines
status: done
created: 2026-10-03
---

# Fuzz the api-types trimmer: ship everything the API reaches, nothing else

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
- The drizzle example app's slim routes pass oracles 1 and 2; the whole app passes oracle 2 (its plain drizzle
  routes genuinely reach `drizzle-orm`, which the self-contained package todo removes).
- Every finding is fixed with its own regression test.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan — implement-todo (approved 2026-10-03)

- **Fixed "must not ship" tests** in `apitypes/trim_test.go` / `drizzle_test.go`: a heavy package type used only by a
  private or raw middleware, a non-API export, a handler-only helper, a barrel beside drizzle tables, and an
  augmentation in an unreached file; none may ship or become a peer.
- **Real app**: a Go test trims `packages/private-drizzle-example-app` at `AppApi` (no `drizzle-orm`, `Check` clean,
  build version equal to the manifest's).
- **Fuzz lane `apitypes`** (Go, `apitypes/fuzz_trim_test.go`): random labelled `.d.ts` graphs over every listed
  position, unreached types poisoned and importing a fake heavy package; the four oracles, each with a negative control.
- **apiids lane** also runs the real `mion api-types` and builds a client against the trimmed package.
- **Registration**: FUZZ table, help text, env note, `fuzz-soak.yml` options, lane contract test, fuzz README.
- Out of this PR: putting outside types the API reaches inside the package; filed as its own todo.

## What shipped

- **Fuzz lane `apitypes`** in `ts-go-runtypes/internal/compiler/apitypes/fuzz_trim_test.go`: random labelled graphs
  over every listed position. `implements` is written only against a plain interface with no type references (a
  class must restate what it implements). Augmentations are generated both ways: a poisoned package augmentation
  that must go, and relative augmentations of reached and unreached interfaces. Oracle 2 compares each API member's
  structural type id (`typeid.Compute`) between the full and the trimmed program instead of printed text: mion ids
  sort object members, so key order is not a loss. A coverage test fails when the generator stops writing a
  position, and each oracle (the stand-alone check included) has a negative control.
- **Findings, each fixed with a regression test** (`server_only_test.go`):
  - `import * as M` kept every export of its file; now `M.X` provides only `X` (a bare `M` still keeps all).
  - A kept file's `declare global` and `declare module` blocks shipped whole. Now a global member ships when kept
    code reads its name (`globalThis.x` counts) or, from a kept file, when it merges into a library global
    (`SymbolConstructor`, read through `Symbol`). A relative `declare module './x'` member ships with the declaration
    it augments. A package augmentation ships when kept code imports that package directly or through any package it
    imports. A side-effect import still ships its file's augmentations whole.
- **Fixed "must not ship" tests** (`server_only_test.go`): private and raw middlewares, non-API exports, a barrel
  beside tables, unread augmentations, all with a heavy package that must never ship or become a peer.
- **Drizzle example app** (`drizzle_test.go`, sharing one workspace setup with the existing drizzle test): its slim
  routes ship no `drizzle-orm` at all, and the whole app type-checks with the server manifest's build version. Its
  plain drizzle routes return types of real drizzle tables, so `drizzle-orm` is genuinely reached there; shipping
  those without the peer is the self-contained package todo.
- **apiids lane** also runs `mion api-types` and builds a client from the package alone (A4), with a negative control
  where only the stale package can fail the client. Its router stub became an installed package carrying the build
  version, pinned with the client stub against the shipped sources, and its generated types are exported so the
  declaration build can name them.
- Registered at the quick tier (ci.yml's Go suite step, `MION_FUZZ_ITER: '30'`) and the soak tier (1000 iterations,
  40 minute timeout). The Go lane now hashes the example app, router and core sources the drizzle tests compile.
