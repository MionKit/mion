---
type: feature
spec: full-plan
status: ready
created: 2026-08-01
---

# Runtime-aware key counting in the `rt::countEnumKeys` factory

## Problem

`rt::countEnumKeys` counts enumerable keys with a `for-in` loop, and both the TS
registration and the Go emitter justify that choice explicitly **on V8**:

- `packages/ts-runtypes/src/runtypes/pure-fns-utils.ts:45-57` — "no array
  allocation (beats `Object.keys(obj).length` ~1.4x on V8)".
- `ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_shared.go:268-275`
  (`emitCountKeysCheck`) — "A for-in counter beats `Object.keys(v).length` ~1.4x
  on V8 (no array allocation)".

The claim is correct on V8 and **inverts on JavaScriptCore** (Bun). JSC serves
`Object.getOwnPropertyNames` from cached structure property tables, while its
`for-in` is comparatively slow; V8 is the opposite (enum-cache fast path for
`for-in`, array allocation for `getOwnPropertyNames`).

This is the entire `runsAfterValidation` key-count fast path, so it is the whole
strict-mode cost.

Measured on the emitted benchmark bundle, full strict path
(`validate(v) && !hasUnknownKeys(v)`), with **one strategy per process** over a
rotating pool of 64 distinct objects, median of 7 samples, and the variant order
reversed on a second pass to rule out ordering effects:

| engine | `for-in` (today) | `getOwnPropertyNames` | `Object.keys` |
|---|---|---|---|
| node v22.22.2 | **20.5 / 19.9 ns/op** | 34.9 / 32.8 ns/op | 30.3 / 33.2 ns/op |
| bun 1.2.12 | 25.4 / 25.1 ns/op | **12.7 / 13.6 ns/op** | **12.7 / 14.1 ns/op** |

So `for-in` is ~1.6x better on V8, and the alternatives are **~1.9x better on
JSC**. Both orders agree, and every figure is within a physically plausible
range (5-35ns for a ten-field check), which is what makes them trustworthy.

**`Object.keys` is the strategy to use on JSC.** It ties `getOwnPropertyNames`
within noise while being semantically much closer to `for-in`, which removes
most of the divergence risk described below.

### Methodology note — the first version of this spec was wrong

The numbers above replace an earlier set (claiming 1.22x on JSC and 3.4x for
for-in on V8) that were measured with a shared `measure(fn)` helper. Passing a
different function per variant makes that call site polymorphic, so whichever
variant ran first got the monomorphic fast path and the rest were penalised. A
second error compounded it: counting keys of a single frozen constant lets JSC
fold the whole call away, which produced a nonsense 1342M pairs/s.

Anything re-measuring this must therefore: run **one variant per process**, use
**non-constant inputs**, **reverse the order** across passes, and **sanity-check
ns/op against physical plausibility** before believing any of it.

Real-world impact, from the published
[typescript-runtime-type-benchmarks](https://github.com/moltar/typescript-runtime-type-benchmarks)
results (`docs/results/*.json`, margins <1% so these are solid measurements):

| benchmark | ts-runtypes | typia | ratio |
|---|---|---|---|
| `assertStrict` node-24 | 38.10M | 28.50M | **1.34x ahead** |
| `assertStrict` bun-1.2 | 3.12M | 4.57M | **0.68x behind** |

The same code leads on V8 and trails on JSC. Those published figures are the
independent evidence that a real JSC strict-path deficit exists: they come from
moltar's CI rather than a local machine, and their sub-1% margins clear the
plausibility checks.

The ~1.9x local improvement above is roughly twice the size of that published
gap, so the swap should close it comfortably — but the published numbers and the
local ones come from different hardware and cannot be composed into a single
predicted result. Treat "closes the gap" as the hypothesis this change tests,
not as a measured outcome.

## Fix direction

The pure-fn **factory runs once at materialization**, inside the target runtime
(`materializeRTFn` → `entry.createRTFn(rtUtils)`,
`packages/ts-runtypes/src/runtypes/rtUtils.ts:342`; `materializePureFn` sets
`compiled.fn = factory(rtUtils)` at `:241`). That makes the factory the correct
and cheapest place to branch: the engine test runs **once**, and the returned
closure is monomorphic and branch-free on the hot path.

Change the factory at `packages/ts-runtypes/src/runtypes/pure-fns-utils.ts:45`
to select the counter and return it:

```ts
export const pf_countEnumKeys = registerPureFnFactory('rt::countEnumKeys', function () {
  // JSC (Bun) serves getOwnPropertyNames from cached structure tables and has a
  // comparatively slow for-in; V8 is the reverse (enum-cache for-in, allocating
  // getOwnPropertyNames). Decided ONCE at materialisation, so the returned
  // counter stays branch-free.
  if (typeof Bun !== 'undefined') {
    return function _countEnumKeys(obj: Record<StrNumber, any>): number {
      return Object.keys(obj).length;
    };
  }
  return function _countEnumKeys(obj: Record<StrNumber, any>): number {
    let count = 0;
    for (const _key in obj) count++;
    return count;
  };
});
```

Feasibility is already confirmed against the purity checker:

- **`Bun` is an allowed global** — `purityrules.go:72`, under "Console + runtime
  hints". No rule change needed.
- **`process`, `globalThis`, `global` are forbidden** (`purityrules.go:141,149`),
  so they are not options for engine detection.
- **`Deno` is in neither set**, so referencing it raises `CodePurityClosure`
  (`purefunctions/purity.go:141-149`). That is fine and needs no change: Deno
  runs V8, so it must take the default branch anyway. `typeof Bun !== 'undefined'`
  is both sufficient and the only permitted probe.
- **Precedent exists** for factories doing real one-time work and returning a
  closure: `rt::findCycle` builds its `nav` / `dfs` closures in the factory
  ("created ONCE here (factory closure, at materialisation)").
- **No JS-side purity twin to keep in sync.** The comment at `purityrules.go:3`
  references `packages/devtools/src/eslint/rules/purityRules.ts`, which no longer
  exists — purity is enforced Go-side only, and the JS lint side merely routes Go
  diagnostics (`packages/ts-runtypes-devtools/src/eslint/diagnosticRouting.ts`).
  Worth fixing that stale reference while here.

### The load-bearing risk: the two counters are not semantically identical

This is the part to settle before writing code, not after:

| strategy | counts |
|---|---|
| `for-in` (today) | own **+ inherited** enumerable |
| `getOwnPropertyNames` | **own only**, including **non-enumerable** |
| `Object.keys` | own enumerable |

If the two branches ever disagree on an input the fast path can reach, the same
program validates differently on Bun and on Node — a far worse outcome than the
throughput it buys. The exposure is bounded by `countFastPathN`
(`unknownkeys_shared.go:240-266`), which only enables the fast path when every RT
child is required, there is no index-signature child, and the RT children are
*all* the children; combined with the serializable-data validate contract, the
realistic input is a plain object literal, where all three agree.

The re-measurement above resolves most of this: **`Object.keys` matches
`getOwnPropertyNames` on JSC** (12.7 / 14.1 vs 12.7 / 13.6 ns/op), so there is
no need to accept the non-enumerable divergence to get the win. `Object.keys`
differs from `for-in` only on **inherited** enumerable properties.

That leaves one question to settle rather than three: can a fast-path-eligible
value carry inherited enumerable properties? Given `countFastPathN` requires all
children required, no index signature, and RT children equal all children — and
given the serializable-data validate contract — the answer is very likely no,
but it should be proven rather than assumed, since the cost of being wrong is a
value validating differently on Bun and on Node.

An earlier draft of this spec claimed `Object.keys` was not competitive on JSC
(25.5M vs 27.9M). That came from the flawed measurement described above.

### Rebuild the built-in table

`rt::` factory bodies are **hollowed out of the dist** (`scripts/core/hollow-builtin-purefns.mjs`)
and shipped on demand from the Go built-in table, so editing the TS source is
only half the change:

- Regenerate `ts-go-runtypes/internal/cachegen/builtinpurefns/table.generated.go`
  via `pnpm rtx core codegen builtinpurefns` (`scripts/rt.mjs:98`).
- The `countEnumKeys` `bodyHash` changes from `9G3IeKwgi6nAe7`
  (`table.generated.go:13`), invalidating cached entries. `constants.Version`
  already folds into type-id hashes, so a version bump covers consumers.
- `pnpm rtx core codegen all --check` must be green (CI runs it).

The emitter needs **no change** — `emitCountKeysCheck` keeps emitting
`cntEK(v) !== N`; only the body behind `cntEK` differs.

## Tests

- **Go, purity** (`internal/cachegen/purefunctions/purity_test.go`) — pin that a
  factory referencing `Bun` passes the checker, so the allowance cannot silently
  regress.
- **Go, codegen** — `pnpm rtx core codegen all --check` green; the regenerated
  table carries the new body + hash.
- **JS, cross-strategy equivalence** (the important one) — extract both counters
  and assert they agree for every fast-path-eligible shape: plain literals,
  nested objects, all-required shapes, and the negative cases (extra key, missing
  key, swapped key). This is what guards against an engine-dependent validation
  result.
- **JS, behaviour** — existing `hasUnknownKeys` suites must stay green on both
  branches. Since CI has no Bun lane, force the JSC branch under Node by testing
  the counter directly rather than relying on the ambient engine.
- **Marker rule** — no `getRunTypeId` surface is touched here, but if any new
  resolver-level test is added it must cover both call shapes per
  [CLAUDE.md](../../CLAUDE.md).

## Fuzzing

Good candidate, cheap oracle (compare-to-a-trusted-source): generate random
objects, restrict to fast-path-eligible shapes, and assert the two counters
return the same value. Any disagreement is exactly the cross-engine divergence
the risk section is about. Fits the existing harness under
`packages/ts-runtypes/test/fuzz/`.

## Docs

- Update the two comments that assert the V8-only rationale
  (`pure-fns-utils.ts:46-50`, `unknownkeys_shared.go:270-271`) — as written they
  are now half-true and would mislead the next reader.
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md) if it describes pure-fn
  materialisation, to note that a factory may specialise per engine.
- **No website change.** Per [CLAUDE.md](../../CLAUDE.md), consumer-facing docs
  exclude knobs only a contributor would care about; this is invisible to users
  apart from being faster.
- Fix the stale `purityRules.ts` reference at `purityrules.go:3`.

## Out of scope

- `rt::hasUnknownKeysFromArray` (`pure-fns-utils.ts:59`) also uses `for-in` and
  is likely subject to the same inversion — worth its own todo once this pattern
  is proven, but not part of this change.
- Detecting Deno or any engine beyond Bun (Deno is V8; the default branch is
  already correct).
- Changing fast-path eligibility in `countFastPathN`.
- The benchmark case in moltar's repo — a separate, external change.
- Any general "engine-adaptive codegen" framework. This is one primitive.

## Done when

- The factory branches on `typeof Bun !== 'undefined'` and returns the matching
  counter, decided once at materialisation.
- The built-in table is regenerated and `codegen all --check` is green.
- Cross-strategy equivalence is pinned by tests, and the semantics question above
  is explicitly resolved (proven unreachable, or the branch narrowed).
- Measured: no regression on V8, and a win on Bun in the region of the 1.9x
  above — re-measured with one variant per process, non-constant inputs, and
  reversed ordering, per the methodology note.
- The V8-only comments and the stale purity reference are corrected.
