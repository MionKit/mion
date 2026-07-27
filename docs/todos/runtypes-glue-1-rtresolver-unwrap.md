# Unwrap `rtResolver` — drop the dead export, decide whether the wrapper survives

**Status:** todo — deferred (see parent)
**Type:** chore
**Spec:** full-plan
**Created:** 2026-07-27

**Parent:** [runtypes-glue-0-umbrella.md](runtypes-glue-0-umbrella.md) — deferred until after PR #128 merges.

Surfaced by PR #128 review comment
[r3634568676](https://github.com/MionKit/mion/pull/128#discussion_r3634568676): *"wrapper seems to
me like a proxy, and the goal of this pr is to remove proxy and unwrap things, and use ts-runtypes
directly."*

## Problem

`packages/core/src/runtypes/rtResolver.ts` (74 lines) is the last wrapper layer between mion and
the ts-runtypes compiled-fn cache. Its **type** mirror is already gone — `RtCacheEntry` was deleted
in `6fc614b`, so `getRtEntry` now returns upstream's own `CompiledTypeFn` straight from
`getRTUtils().getRT()`. What remains are the wrapper **functions**.

### Caller map (verified)

| Export | Callers |
| --- | --- |
| `normalizeArgs` | **none** — dead export |
| `toJitCompiledFn` | 1: `mionAdapter.ts:138` (fallback when no cache entry) |
| `getRtEntry` | 3: `mionAdapter.ts:136,176,177` |
| `wrapRtEntry` | 3: `mionAdapter.ts:137,191,192` |
| `resolveJIT` | **15+**: `routerUtils.ts:184-197,221,222`, `remoteMethods.ts:128,149,156`, specs; public via `core/index.ts:40` |
| `resolveCompiledPureFn` | `remoteMethods.ts:114`, specs; public via `core/index.ts:40` |

So this is **not** a thin proxy that can simply be deleted: `resolveJIT` is load-bearing across the
router and is public API.

### What the wrapper actually buys

`wrapRtEntry` exists because mion's consumers assume fields that are **optional upstream**:

- `fnID` — set from the caller's family key (upstream carries `familyTag`, a different axis)
- `args` / `defaultParamValues` — run through `normalizeArgs`, which guarantees a `vλl` key
- `code: entry.code ?? ''` — mion treats `code` as a required string; upstream types it `code?`
- `createRTFn: entry.createRTFn ?? (() => entry.fn)` — upstream types both optional
- `isNoop: !!entry.isNoop`

Removing the wrapper therefore means auditing every consumer for optionality, not just deleting a
function. That is the real work, and why it did not ride the type-mirror removal.

## Plan

Do it in three steps, smallest first — each independently landable.

1. **Delete `normalizeArgs`** (`rtResolver.ts:34`). Zero callers. Inline its `vλl` defaulting into
   `wrapRtEntry` (its only real use) or drop it if step 3 removes the wrapper anyway.
2. **Audit the optionality assumptions.** For each of `code`, `createRTFn`, `fn`, `args`: find what
   consumers do when it is absent. `routerUtils.ts:184-197` feeds `JitCompiledFunctions`;
   `remoteMethods.ts:128` serializes entries for the client-metadata wire, where an absent `code`
   is meaningful (nothing to ship) rather than an error. Decide per field: does mion genuinely need
   the defaulted value, or was `?? ''` papering over a case that should be handled explicitly?
   **This is the crux — do it before writing any code.**
3. **Then choose:**
   - **(a) Keep a thinner `resolveJIT`** — if the `fnID` remap is genuinely needed (mion's
     `JitCompiledFunctions` keys off mion's own family names, not upstream `familyTag`), keep the
     function but strip everything the audit shows is unnecessary, and document *why* it is not a
     proxy.
   - **(b) Remove it** — if consumers can read `getRT()` output directly, replace all 15+ call
     sites with `getRTUtils().getRT(hash)`, delete `rtResolver.ts`, and drop the
     `resolveJIT` / `resolveCompiledPureFn` exports from `packages/core/index.ts:40`. Note both are
     **public API**, so this is a breaking change for consumers — call it out, and remember mion is
     pre-1.0 (`@mionjs/core` 0.8.x), so it is defensible.

`toJitCompiledFn` (the no-cache-entry fallback) is mion-specific fabrication with no upstream
equivalent; keep it either way, but rename it away from the retired "jit" vocabulary.

## Tests

- `packages/core/src/runtypes/rtResolver.spec.ts` already pins the miss paths
  (`resolveJIT('does_not_exist')`, `resolveCompiledPureFn('ns','missing')`). Keep them pointed at
  whatever survives.
- `mionAdapter.spec.ts:98-105` and `router/src/lib/remoteMethods.spec.ts:96-103` rebuild fns from
  emitted `code` — these are the real guard for step 2. If `code` stops being defaulted, they must
  still pass or be updated to assert the explicit absent case.
- Add a case for an entry whose `code` is genuinely absent (a noop entry), asserting the consumer
  handles it rather than receiving `''`.

## Out of scope

- The `fnID` vs upstream `familyTag` naming question beyond what step 2 needs.
- `mionPureFns.ts` — separate lane, see
  [runtypes-glue-2-pure-fns-registry.md](runtypes-glue-2-pure-fns-registry.md).

## Done when

- `normalizeArgs` is gone.
- Every remaining export in `rtResolver.ts` has a documented reason to exist that is not "reshapes
  ts-runtypes data", or the file is deleted.
- If exports were removed from `packages/core/index.ts`, the breaking change is noted in the PR.
- Full suite + lint + format green.
