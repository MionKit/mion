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
strict-mode cost. Measured on the emitted benchmark bundle, full strict path
(`validate(v) && !hasUnknownKeys(v)`), median of 5 runs of 1M iterations:

| engine | `for-in` (today) | `getOwnPropertyNames` | |
|---|---|---|---|
| node v22.22.2 | **15.18M ops/s** | 8.26M ops/s | for-in 1.85x better |
| bun 1.2.12 | 1.87M ops/s | **2.27M ops/s** | gOPN 1.22x better |

Isolating the pieces on Bun, `hasUnknownKeys` alone runs at ~1.7M ops/s while
the full strict path runs at ~1.6M — `validate` contributes almost nothing, so
the key counter *is* the bottleneck.

Real-world impact, from the published
[typescript-runtime-type-benchmarks](https://github.com/moltar/typescript-runtime-type-benchmarks)
results (`docs/results/*.json`, margins <1% so these are solid measurements):

| benchmark | ts-runtypes | typia | ratio |
|---|---|---|---|
| `assertStrict` node-24 | 38.10M | 28.50M | **1.34x ahead** |
| `assertStrict` bun-1.2 | 3.12M | 4.57M | **0.68x behind** |

The same code leads on V8 and trails on JSC, purely because of this one
primitive. A local A/B puts the patched counter at 2.27M against typebox's
2.3M on Bun, i.e. the swap closes essentially the whole gap.

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
      return Object.getOwnPropertyNames(obj).length;
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

`Object.keys` would be the semantically closest swap, but it measured 25.5M vs
for-in's 27.9M on JSC — no win. So `getOwnPropertyNames` is the only option that
pays, and it carries the delta. Decide explicitly: either prove the fast-path
eligibility rules make the divergence unreachable, or narrow the JSC branch to
the shapes where equivalence holds.

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
- Measured: no regression on V8, and a win on Bun in the region of the 1.22x
  above.
- The V8-only comments and the stale purity reference are corrected.
