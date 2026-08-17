---
type: feature
spec: guidelines
status: ready
created: 2026-08-17
---

# Natural-JSON parse: a fused validating decoder

## Intent

A factory that takes PLAIN third-party JSON (a request body, a form payload)
and returns the validated, restored JS value — dates revived, bigints parsed,
Maps rebuilt — with wire-accurate issues when the input is wrong. "Parse,
don't validate", standard-free: this is a RunTypes feature on its own merits,
not an interop-spec obligation.

Why the existing pieces cannot compose it (established during the
StandardJSONSchemaV1 work, 2026-08):

- `restoreFromJson` (`rj`) reads the RUNTYPES wire — the flat-union envelope
  (`[memberIndex, value]` / `[-1, mergedObject]`, union_flat.go) that
  `createJsonEncoderFn` writes. A plain client never sends envelopes, so
  restore-then-validate mis-handles exactly the types where restore matters
  (discriminated object unions, Date inside unions).
- the `val` validator checks the JS-typed shape (`instanceof Date`,
  `typeof bigint`), so it rejects wire values before any revival.

## Direction

A new composite family: ONE walk over plain JSON that validates each slot's
WIRE form (an ISO string where the type says Date, digit strings for bigint,
entry arrays for Map) and revives it in the same pass, dispatching union
members by checking rather than by envelope index, and recording issues that
describe the JSON the caller actually sent. It fits the per-(typeId,
strategy) composite machinery the `jsonDecoder` family already uses
(internal/cachegen/typefunctions/json_composite.go is the pattern);
`JSONShape<T>`'s leaf table documents the wire forms to check, and the
`jsonShapeWire` tests pin them. The implementer plans the emitter design,
the issue mapping, and whether the wire for unions should be the natural
member value (recommended: yes — that is the whole point).

## Done when

`createJsonParseFn<T>()` (name to be decided) accepts plain JSON for the
whole serializable type space, returns the restored `DataOnly<T>` or
wire-accurate issues, round-trips `JSON.parse(createJsonEncoderFn(v))` for
envelope-free types, and has suite + fuzz coverage (the roundtrip lane's
generators fit).
