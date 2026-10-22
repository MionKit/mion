---
type: fix
spec: guidelines
status: done
created: 2026-10-22
---

# apitypes soak: trimming the trimmed output changes `_outside/_shared.d.ts`

## Evidence

Release PR #520 (`release/v0.13.2`, commit `69c4f9450`), lane `gate / fuzz soak · apitypes`:

```
--- FAIL: TestFuzz_ApiTypesTrim (329.79s)
    fuzz_trim_test.go:30: [apitypes-fuzz] seed 39803810701 from MION_FUZZ_SEED
    fuzz_trim_test.go:42: iteration 500 (case seed 3112647654236498255, replay with MION_FUZZ_SEED=39803810701):
        idempotent: trimming the output again changed _outside/_shared.d.ts:
        --- first ---
        export declare class KEEP_0_ {
          id0: string;
        }
        export {};
        --- second ---
        (differs)
```

In the trimmed `api.d.ts`, `KEEP_0_` is also declared locally (`declare class KEEP_0_ { id0: string; }`),
and `KEEP_1_<T0 = KEEP_0_>` defaults to it, so the second pass seems to stop seeing a reference to the
outside copy in `_outside/_shared.d.ts`. The full generated and trimmed trees are in the CI log of
job 119911684499.

## Repro

```bash
pnpm run check:builds   # rebuild the resolver first: a stale binary gives false results
MION_FUZZ_SEED=39803810701 pnpm miondevx core fuzz apitypes --soak
```

Never re-roll the seed. Case seed `3112647654236498255` (iteration 500) should rebuild the single
case faster if the Go fuzz test supports a per-case replay.

## Intent

Trim is idempotent: trimming its own output changes nothing. Decide whether the first pass keeps a
`_shared.d.ts` declaration it should drop (or dedupe against the local one), or the second pass drops
one it should keep, fix the real cause in `ts-go-runtypes/internal/compiler/apitypes`, and pin the
case as a regression test.

## Plan: skip a kept class's body (approved 2026-10-22, automatic mode)

Cause: the first pass printed `LibPage<KEEP_1_>` into `_outside/lib-pkg.d.ts` as `import("../api.js").KEEP_1_`,
since `KEEP_1_` is an exported project class that stays in `api.d.ts`. `reachedKeys` still walked the printed
body of `KEEP_1_`, whose default `T0 = KEEP_0_` reached the unexported `KEEP_0_`, so `KEEP_0_` shipped in
`_shared.d.ts` with nothing naming it. The second pass reads the output, finds no use of it, and drops it.

Fix (`outside.go`): `reachedKeys` no longer reads the body of a key placed as a kept project or mion class/enum
(`projectDecls`). `placeOutside` now places each key as `reachedKeys` meets it, so a key is known as kept before
its body would be read.

Regression test: `TestOutside_AKeptClassDefaultingToAnUnexportedOneShipsNothingShared` (fails before the fix).
