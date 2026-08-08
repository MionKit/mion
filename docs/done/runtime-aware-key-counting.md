---
type: feature
spec: full-plan
status: done
created: 2026-08-01
completed: 2026-08-08
---

> **Shipped.** See [What actually shipped](#what-actually-shipped) at the bottom for the
> three places the implementation diverged from the plan below — most importantly, the
> JSC counter is **prototype-guarded** rather than a bare `Object.keys`, because the
> open semantics question resolved as *reachable* rather than *unreachable*.

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

## What actually shipped

Landed on `feature/runtime-aware-key-counting`. The shape of the change is the one
planned above — the factory branches on `typeof Bun !== 'undefined'` once at
materialisation — but three things came out differently.

### 1. The open semantics question resolved as REACHABLE, so the branch was narrowed

The plan left one question open: "can a fast-path-eligible value carry inherited
enumerable properties?", with the expectation that the answer was "very likely no".
It is **yes**, and cheaply so:

```ts
// declared {a: string; b: number} — validate passes (both props read through the
// prototype chain), so the strict path reaches the counter.
const value = Object.create({b: 2});
value.a = 'x';
// for-in counts 2 (clean) — Object.keys counts 1 (dirty). The engines disagree.
```

Nothing in `countFastPathN` excludes it: it constrains the declared TYPE (all children
required, no index signature, RT children = all children), never the prototype chain of
the incoming VALUE. The emitted validator reads `v.prop`, which walks the prototype
chain, so an inherited property satisfies validation exactly like an own one. The
existing note on `HasUnknownKeysCompileOptions`
(`packages/ts-runtypes/src/createRTFunctions.ts:127`) already warns that "validated props
living on a prototype can fool" the count check — but "already documented as unreliable"
is much weaker than "answers differently per engine", which is the outcome the plan
called unacceptable.

So the second option the plan allowed was taken: **the branch was narrowed** rather than
the case proven away. The JSC counter tests the prototype per call and falls back to
for-in when the chain could contribute enumerable keys:

```ts
if (typeof Bun !== 'undefined' && Object.keys(Object.prototype).length === 0) {
  const objectProto = Object.prototype;
  return function _countEnumKeys(obj) {
    const proto = obj != null ? Object.getPrototypeOf(obj) : undefined;
    if (proto === objectProto || proto === null) return Object.keys(obj).length;
    let count = 0;
    for (const _key in obj) count++;
    return count;
  };
}
```

Three guards, at three different costs, and only one of them is on the hot path:

- The per-call `getPrototypeOf` comparison is the load-bearing one. It costs ~1-2 ns on
  JSC, inside the run-to-run noise of the unguarded `Object.keys` version.
- `obj != null` exists for equivalence, not safety. The fast path only ever sees
  validated objects, but `for-in` over a nullish value iterates zero times where
  `Object.getPrototypeOf` throws — so without it a stray nullish input would throw on Bun
  and return 0 on Node, which is the exact class of divergence this spec set out to
  prevent. (This was missed in the first cut of the implementation and caught while
  reviewing the equivalence claim; the nullish and primitive cases are now pinned by
  test.)
- `Object.keys(Object.prototype).length === 0` closes the last hole — an enumerable
  property added to `Object.prototype` is seen by for-in and not by `Object.keys`. It
  cannot vary per input, so it is hoisted to materialisation and costs nothing per call.
  If it ever trips, Bun takes the for-in counter and loses the speedup, not the
  correctness.

The result is stronger than planned: the two counters are equivalent for **every** input,
not merely for inputs believed to be in contract.

### 2. Measured numbers

Re-measured per the methodology note (one variant per process, rotating pool of 64
distinct objects, median of 7 samples, variant order reversed, ns/op plausibility
checked). Full strict path `validate(v) && !hasUnknownKeys(v)` over a 10-field shape.
Different hardware and newer runtimes than the plan's table, so the figures are not
directly comparable to it:

Medians in ns/op, with the observed range across runs in brackets:

| engine | `for-in` (was) | bare `Object.keys` | **shipped (guarded keys)** |
|---|---|---|---|
| node v26.7.0 | **~18.5** [17.6-19.8] | ~24.9 [24.8-25.0] | ~39.0 — never taken on V8 |
| bun 1.3.11 | ~25.2 [23.9-27.8] | ~16.6 [14.0-17.5] | **~17.6** [14.8-19.3] |

- **V8: unchanged.** Node keeps the for-in counter, so there is no regression. The
  39 ns/op figure is what the guarded counter *would* cost on V8 — more than double the
  incumbent — and is precisely why this is an engine branch rather than one counter
  everywhere.
- **Bun: ~1.43x** (25.2 → 17.6 ns/op). Less than the plan's hoped ~1.9x. The guards are
  not the main reason: bare `Object.keys` measured ~16.6 on the same box, so all three
  guards together cost about 1 ns. The rest of the gap to the plan's figure is hardware
  and runtime versions (node 26.7 / bun 1.3.11 here vs node 22.22 / bun 1.2.12 there).

Whether this closes the published `assertStrict` bun-1.2 deficit against typia remains
the hypothesis it always was; that runs on moltar's CI, not here.

### 3. Test placement

The plan filed the equivalence property under "Fuzzing" and pointed at
`packages/ts-runtypes/test/fuzz/`. It shipped instead as a seeded sweep inside
`packages/ts-runtypes/test/features/countEnumKeys.test.ts`, next to the deterministic
equivalence cases it generalises. The fuzz harness generates RunTypes **types and
values**; this property is over raw JavaScript objects and prototype chains, which none
of its generators produce, so living there would have meant a parallel generator with no
harness benefit. The sweep is deterministic (`mulberry32`, fixed base seed, 5000 objects)
and reports the failing seed, so it replays like a harness finding.

### Files changed

- `packages/ts-runtypes/src/runtypes/pure-fns-utils.ts` — the branching factory, plus an
  ambient `declare const Bun` (the package sets `types: []`).
- `ts-go-runtypes/internal/cachegen/builtinpurefns/table.generated.go` — regenerated;
  `countEnumKeys` bodyHash `9G3IeKwgi6nAe7` → `UK-pJ-Sd7C03ja`.
- `ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_shared.go` — the V8-only
  rationale on `emitCountKeysCheck` replaced; the emitter itself is unchanged.
- `ts-go-runtypes/internal/cachegen/purefunctions/purityrules.go` — stale
  `purityRules.ts` reference corrected.
- `ts-go-runtypes/internal/cachegen/purefunctions/purity_test.go` — `Bun` probe pinned as
  allowed, `process` probe pinned as forbidden.
- `packages/ts-runtypes/test/features/countEnumKeys.test.ts` — new; branch-selection
  spies, 19 deterministic equivalence cases (including the nullish / primitive
  out-of-contract inputs), and the seeded sweep.
- `docs/ARCHITECTURE.md` — the `purefunctions` bullet now notes that a factory may
  specialise per engine, and that variants must answer identically.

### Verified

- `go -C ts-go-runtypes test ./internal/...` green.
- `pnpm test` green; `pnpm rtx core codegen all --check` green.
- Real Bun 1.3.11 confirmed to take the `Object.keys` branch and to agree with the V8
  counter on plain, null-prototype, and inherited-enumerable inputs.

### Follow-up filed

- `docs/todos/runtime-aware-unknown-keys-scan.md` — the out-of-scope
  `rt::hasUnknownKeysFromArray` / `rt::getUnknownKeysFromArray` sibling, now that the
  pattern is proven.
