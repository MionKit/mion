---
type: fix
spec: guidelines
status: ready
created: 2026-10-19
---

# apitypes soak: the trim leaves a lib-pkg import, so the types-only package does not type-check alone

## Evidence

Release gate run 39249346902 on `main` @ `f95566c2d`, lane `fuzz soak · apitypes` (Go: `TestFuzz_ApiTypesTrim`,
`ts-go-runtypes/internal/compiler/apitypes/fuzz_trim_test.go`).
Replay: `MION_FUZZ_SEED=39249346902 pnpm miondevx core fuzz apitypes --soak` (iteration 637, case seed 1651065882486030198).

```
no leak: f1.d.ts ships "'lib-pkg'"
no leak: peers [@mionjs/router lib-pkg], want only @mionjs/router
no leak: a type stayed an import: f1.d.ts: `LibPage<KEEP_1__as_1>` from lib-pkg stays an import,
  so lib-pkg stays a peer dependency: a literal is not convertible yet
client parity: the package does not type-check alone:
  .../@acme/api-types/f1.d.ts: Cannot find module 'lib-pkg' or its corresponding type declarations.
```
The trimmed `f1.d.ts` keeps `import type { LibPage } from 'lib-pkg'` (used as
`lib2: (input: LibPage<KEEP_1__as_1>) => LibPage<KEEP_1__as_1>` inside a namespace interface), while
`LibRole` / `LibItem` were printed into `_outside/lib-pkg.d.ts`.

## Intent

The apitypes trim must print every outside type a client reaches into the package, or the oracle must
accept the documented "not convertible yet" case without failing client parity. Decide which side is
wrong from the trim's contract, then fix the root cause: likely the generic `LibPage<T>` reached through
a function-typed member inside a namespace is not printed like the other outside types.

## Done when

- The failing seed replays green with the command above.
- A regression test pins the shape (generic outside type used through a function member in a namespace).
