---
type: fix
spec: guidelines
status: ready
created: 2026-08-03
---

# The playground engine tests fail confusingly on a stale WASM cache

Found while implementing
[purefn-type-stripper-drops-no-type-arguments.md](../done/purefn-type-stripper-drops-no-type-arguments.md).
`pnpm test` reported 4 failures that had nothing to do with that change.

**This is a local-cache condition, not a broken branch.** It needs no source
edit, but it does need a stale `.cache/rt-wasm/`, which is per-machine state:
that directory is git-ignored, so it is absent on a fresh clone and on CI (the
handled case, where the suites skip), and a `git worktree add` does not
inherit a valid one. The failure showed up here precisely because the work ran
in a worktree carrying a WASM build from before the module-prefix rename. On a
checkout whose cache was rebuilt recently, the whole suite passes. Do not read
the transcript below as "main is red".

## Evidence

Failing, with no local edits, against a stale cache:

```
FAIL |playground| engine.test.ts > transformedSource is the real transform: injected import + a clean __rt_ arg (type mode)
FAIL |playground| engine.test.ts > transformedSource injects the id after the schema in the value-first form (mode: schema)
FAIL |playground| engine.test.ts > sample-less pattern mockSamples generate in WASM via the sidecar hook
FAIL |playground| jsonSchema.test.ts > injects the id as a trailing argument on the builder call
```

Each asserts the entry-module scheme and gets the pre-rename one:

```
expected: /^import \{__rt_[A-Za-z0-9_]+} from 'rtmod:\/.+';/m
received: "import {__rt_CiE_T9PLJPz} from 'virtual:rt/fns/val.js'; ..."
```

`virtual:rt/` was renamed to `rtmod:/` in `bc54259f` (2026-07-18), and
`constants.EntryModulePrefix` has read `rtmod:/` ever since. The tests are
right; the WASM they run against is old:

```
$ ls -la .cache/rt-wasm/
-rwxr-xr-x  38987307  Jul  7 23:33  ts-runtypes.wasm      # predates the rename
$ strings .cache/rt-wasm/ts-runtypes.wasm | grep -c 'virtual:rt/'
1
$ strings .cache/rt-wasm/ts-runtypes.wasm | grep -c 'rtmod:/'
0
```

## Why the staleness check does not save you

[build-playground.mjs](../../container/website/scripts/build-playground.mjs)
does have a freshness gate: `wasmMaybeStale()` rebuilds when any Go input is
newer than `.cache/rt-wasm/.wasm-stamp`. It is sound, and it is never consulted
during a test run. `pnpm test` (and its `pretest`) build the resolver binary and
the devtools dist, not the playground WASM, so nothing revalidates `.cache/`
unless you separately run `pnpm rtx website dev|build` or the script by hand.

The mtime anchor also cannot survive a fresh `git worktree add`: checkout
mtimes and the copied-over stamp have no reliable ordering, so a worktree can
inherit a stale cache that looks current.

`nodeResolver.ts`'s `assetsBuilt` only tests for **existence**. That gives three
states with only two handled:

| `.cache/rt-wasm/` | behaviour | good? |
| --- | --- | --- |
| absent | tests skip with a clear note | yes |
| present, current | tests run | yes |
| present, stale | tests run against old code and fail on unrelated assertions | no |

The third is the whole bug. A contributor who has never touched the playground
sees four red tests naming a module prefix they did not change.

## Direction

Make the stale case behave like the absent case: detected, and either repaired
or skipped with a reason. Options, cheapest first:

1. Have `assetsBuilt` compare the stamp against the same `WASM_INPUTS` list
   `build-playground.mjs` uses, and skip with "playground WASM is stale, run
   `node container/website/scripts/build-playground.mjs`" instead of running.
   Smallest change, keeps `pnpm test` fast.
2. Stamp the built WASM with `constants.Version` (or the resolver's own build
   id) and have the loader assert it matches the marker package it is testing
   against. Catches drift the mtime heuristic cannot see, including the
   worktree case.
3. Add the playground build to `pretest`. Correct but costs a ~39 MB Go WASM
   build on every test run; only worth it if 1 and 2 prove insufficient.

Prefer 1 + 2: a skip is honest, and a version stamp is the only check that
survives a worktree copy.

## Done when

A stale `.cache/rt-wasm/` makes the playground suite skip (or rebuild) with a
message naming the fix, rather than failing on assertions about unrelated
code, and that behaviour is pinned by a test that points the loader at a
deliberately old stamp.
