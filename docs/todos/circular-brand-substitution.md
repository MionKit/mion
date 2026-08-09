---
type: fix
spec: guidelines
status: ready
created: 2026-08-09
---

# RT.circular loses container-level sentinel payloads (id divergence)

## Problem

`RT.circular(body)` ties the recursive knot through `Recursive<Body>`
(builders/static.ts), whose `SubstituteSelf` walks the body replacing every
`Self`. Containers recurse through a homomorphic mapped type — which MERGES
an intersection into one object shape — and the Map/Set/array arms rebuild
the container from inferred pieces — which DROPS anything intersected onto
it. Both destroy container-level sentinel carriers:

    // converges (no cycle, no substitution):
    getRunTypeId(RT.object({k: RT.record(TF.number(), {minProperties: 2})}))
      === getRunTypeId<{k: TF.FormattedObject<Record<string, number>, {minProperties: 2}>}>()

    // DIVERGES (found by the FE convert roundtrip fuzz lane):
    getRunTypeId(RT.circular(RT.object({k: RT.record(RT.self(), {minProperties: 2})})))
      !== getRunTypeId<Rec>()   // type Rec = {k: TF.FormattedObject<Record<string, Rec>, {minProperties: 2}>}

Affected payloads inside a circular body: structural format brands
(FormattedArray / FormattedObject), the container-borne schema-check
sentinels (`__rtContains`, `__rtPatternProps`, `__rtPropNames`,
`__rtUnevaluated`, container-level `__rtNot`), and the labeled-tuple
`__rtLabels` carrier. Primitive brands (`string & brand`) and Date brands
pass `SubstituteSelf` untouched (the primitive/Date arms return `T`
verbatim), so ordinary format leaves inside cycles are fine — the pinned
convert test `TestCircular_StructuralPayloadRefusedOnBuilders` covers both
sides.

## Current mitigation (shipped)

The convert CLI's builders target REFUSES such declarations loudly (CNV001,
"inside a recursive type is not convertible to builders") instead of
printing an id-moving spelling — `circularLossyPayload` in
internal/convert/print.go. The type and json-schema forms carry these
declarations exactly (`$ref: '#'` rebuilds the payload at the right layer),
so only the value-first authoring is lossy.

## Fix directions to evaluate

- Teach `SubstituteSelf` to carry KNOWN sentinel intersections: TS cannot
  decompose an arbitrary `A & B`, but the sentinels are a CLOSED vocabulary —
  each carrier key could be probed (`__rtFormatName extends keyof T`) and
  re-attached after substituting the base. Verbose but mechanical; the cost
  is one probe per sentinel per container node.
- Alternatively, keep the knot OUTSIDE the substitution: a `circular` brand
  that resolves the body lazily (interface-style deferral) instead of
  eagerly substituting — would need checker evidence that the marker still
  reflects the closed cycle.
- Whatever ships must flip the convert refusal into a printed spelling and
  extend the FE roundtrip lane's expected-refusal allowlist accordingly
  (remove the entry, let the oracle prove convergence).

## Done when

The value-first circular spellings above converge with their type-first
twins (pinned both marker shapes), the convert builders target prints them
instead of refusing, and the FE roundtrip fuzz lane passes with the
allowlist entry removed.
