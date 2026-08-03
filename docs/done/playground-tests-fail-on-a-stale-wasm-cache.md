---
type: fix
spec: guidelines
status: done
created: 2026-08-03
completed: 2026-08-03
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

## What shipped

Option 1 + 2 from Direction, but content-addressed rather than mtime-based, and
narrowed after the first cut proved too eager.

**The root cause was not the worktree.** `pretest` is `check:builds` (resolver
binary + dists) and never builds the playground WASM, so `pnpm test` had **no**
freshness gate on `.cache/rt-wasm/` at all. Edit Go in the main checkout, run
the suite, and it loads whatever wasm happens to be there. The worktree was one
trigger, not the cause. Worth recording: worktrees already get their own
`.cache/` (a real directory, not a share), so per-worktree isolation was never
the missing piece; the worktree that exposed this was a recycled one carrying a
build from its own earlier life.

New [scripts/website/playground-wasm-inputs.mjs](../../scripts/website/playground-wasm-inputs.mjs)
owns the input list and a sha256 over (path, bytes) of every file that compiles
into the wasm. Both sides share it, so they cannot disagree about what "out of
date" means:

- [build-playground.mjs](../../container/website/scripts/build-playground.mjs)
  writes the digest into `.wasm-stamp` (previously an empty mtime anchor) and
  its tier-1 gate now compares digests instead of mtimes.
- [nodeResolver.ts](../../packages/ts-runtypes/test/playground/nodeResolver.ts)
  gains `wasmAssetState() -> 'ready' | 'missing' | 'stale'`, and `assetsBuilt()`
  is `state === 'ready'`. A stale cache warns once with the rebuild command.

**The digest ignores `*_test.go` and `testdata/`.** The first version hashed the
whole tree, which was actively worse than the bug: because the gate SKIPS on a
mismatch, touching any Go test file would have dropped the playground suites
from the run, trading a loud confusing failure for silent coverage loss on most
Go-touching PRs. `go build` compiles neither category, so excluding them is
correct rather than a heuristic. Everything else stays in, including non-Go
files, so a `//go:embed` asset cannot slip through.

Content, not mtimes, because a copied cache can carry a stamp NEWER than the
checkout it no longer matches, and an mtime compare calls that fresh.

## Verified

- Stale stamp: **34 skipped, 0 failures** (previously 4 confusing failures).
- Fresh stamp: **7 files, 52 tests pass**.
- Appending to `atomic_test.go` does **not** change the digest; restoring it
  returns the original value.
- Second `build-playground.mjs` run short-circuits on the digest.
- The rebuild message reaches the reader. The default reporter hides `stderr`
  for non-failing files; `--reporter=verbose` shows it, alongside each suite's
  own existing skip note.

[wasmAssetState.test.ts](../../packages/ts-runtypes/test/playground/wasmAssetState.test.ts)
pins all three states against fixture dirs (including the pre-stamp empty-file
case) and pins the `_test.go` / `testdata/` exclusions, since that filter is
what keeps the gate from eating coverage.
