# Carry the params/return RunTypes on the method reflection

**Status:** todo
**Type:** feature
**Spec:** guidelines — needs investigation before any code
**Created:** 2026-07-27

Raised while closing [param-names-from-reflection.md](../done/param-names-from-reflection.md):
*"I think you can extend the CompiledTypeFn to add paramsRunType and returnRunType, and pass them
to remoteMethods."*

## Intent

Parameter names were the **first** thing mion wanted from the run-type graph, and getting them
meant adding a bespoke `getParamsFromRunType` + a `paramNames` field threaded through reflection →
method → wire. The next thing (per-parameter formats, defaults, descriptions for docs, richer
client-side error labels…) would need the same treatment again.

Carrying the **RunTypes themselves** on the reflection would make that class of question answerable
without a new field each time.

## What is already true (verified 2026-07-27)

- **mion already resolves both RunTypes** in `getReflectionFromMarkers`
  (`packages/core/src/runtypes/mionAdapter.ts`): `resolveInjectedRunType(rtFns.returnId)` at `:282`
  and the params one at `:283`. They are used and discarded — nothing retains them.
- So "pass them to remoteMethods" needs no new resolution work, only a decision about **where they
  live and how far they travel**.

## Direction, and the two constraints to design around

### 1. `CompiledTypeFn` cannot be extended by mion

It is **upstream's** type (`@ts-runtypes/core`, `runtypes/types.d.ts:82`), with `readonly` members.
mion cannot add `paramsRunType` / `returnRunType` to it. That leaves three options, and picking
between them is the main decision:

- **(a) Put them on `RtMethodReflection` / `MethodReflect`** — mion's own types, which already carry
  `paramsCount` / `paramNames`. Cheapest, no upstream dependency.
- **(b) A mion-side carrier type wrapping `CompiledTypeFn`** — ⚠️ this pulls **against**
  [runtypes-glue-1-rtresolver-unwrap.md](runtypes-glue-1-rtresolver-unwrap.md), which is trying to
  *delete* mion's wrapper layer over exactly this type. Do not add a new wrapper while another spec
  removes one; if this looks right, reconcile the two first.
- **(c) Ask upstream** for a field or an accessor. Only worth it if other ts-runtypes consumers want
  the same, which is unknown.

### 2. A `RunType` is a large, possibly circular graph — almost certainly not wire material

`RunType` carries `children`, `parameters`, `typeArguments`, `extends`, `classType`, `index`,
`return` … all recursive, plus an explicit `isCircular` flag. Serializing one per method would
dwarf the current methods-metadata payload, and circular refs mean plain `JSON.stringify` is not
even safe.

Contrast with what shipped for names: **derive server-side, send the small answer.** `paramNames`
costs ~21 bytes for a one-param method. That precedent is probably the right shape — hold the
RunTypes **server-side** on the reflection, and keep deriving compact fields for the wire.

**So the likely answer is (a) + server-side only.** Verify that before building, rather than
assuming it.

## Questions to answer first

1. What concrete consumer wants this? Names had a real one (test assertions + client error
   labelling). Without a second use case, the reflection object grows for nothing — this may be
   worth closing rather than building.
2. Do the RunTypes stay reachable for the lifetime of the reflection, or are they cache entries
   that can be evicted? (`resetJitFnCaches` clears the compiled-fn cache; check whether run-type
   handles survive that.)
3. Memory: one retained graph per method per process. Measure on a realistic route count before
   deciding it is free.
4. Does anything need them on the **client**? If yes, that is a separate design (a compact
   projection, not the graph).

## Done when

- Either the RunTypes are reachable from the method reflection with a documented consumer and a
  measured memory cost, or this spec is closed with the reasoning recorded.
- No new mion wrapper type over `CompiledTypeFn` was introduced without reconciling
  [runtypes-glue-1-rtresolver-unwrap.md](runtypes-glue-1-rtresolver-unwrap.md).
