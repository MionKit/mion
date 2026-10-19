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

## Plan: print unique symbol types (approved 2026-10-19, automatic mode, delegated)

Root cause, found by replaying the case seed alone: not the namespace or the function member. `LibPage<KEEP_1_>`
prints `KEEP_1_` structurally, which reaches `lib0: keyof LibRole`. `keyof` a string enum is a string's keys, which
hold `typeof Symbol.iterator`, a unique symbol type. The declaration printer refused that literal ("a literal is not
convertible yet"), so the whole use stayed an import. Smallest repro: `Page<{ k: keyof string }>` from an outside
package.

The trim's contract (api-types page) says only a use over a type parameter stays an import, so the trim is wrong, not
the oracle.

- Fix: the declaration printer (`flagsDeclareUniqueSymbols`) prints a unique symbol type as `typeof` its key, through
  the same `uniqueSymbolKey` symbol-keyed members use: `typeof Symbol.iterator` for a well-known symbol, else a
  `declare const name: unique symbol;` the file declares (`ts-go-runtypes/internal/convert/printtype.go`,
  `printdecl.go`). The type id keeps only the symbol's name, so ids hold.
- Tests: `TestDeclPrinter_UniqueSymbolTypesPrintAsTypeofTheirKey` (convert, ids checked) and
  `TestOutside_AnOutsideGenericOverAKeyofThroughANamespaceFunctionMemberPrints` (apitypes, the fuzz shape: a generic
  outside type over a project type reaching `keyof`, used through a function member in a namespace, self-contained
  package + id parity). Both fail without the fix.
- Docs: none. The api-types page already promises this; the source-conversion table is about the other printer mode.
- Fuzzing: existing apitypes soak lane is the oracle; replay of seed 39249346902 must pass.
