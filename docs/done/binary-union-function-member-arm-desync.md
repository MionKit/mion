---
type: bug
spec: mini-plan
status: SHIPPED
created: 2026-08-01
shipped: 2026-08-02
---

# Binary codec desyncs on unions with a function-member arm

## Shipped

One-hole fix in `buildMergedProps`
([union_flat_layout.go](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat_layout.go)):
a method-like MEMBER kind (`f0: () => number` scans as a method signature, not
a property-with-function-child) was skipped by the member walk without
recording the stripped candidate, so the surviving same-name candidate from a
sibling arm compiled an UNGUARDED codec — encoding `{kind: 't2', f0: fn}` fed
the function straight to `serString` (the O7 throw). The walk now records
function-like member kinds in `strippedByName`, which flips
`HasStrippedCandidate` and makes every flat-family encoder guard the surviving
codec with the existing G3/G4 value check (`typeof v.f0 === 'string'`), so the
key drops exactly like DataOnly says it should.

**Decisions logged:**

- **Layout-level fix, not per-emitter.** The hole was in the SHARED
  `buildMergedProps`, so one fix covers tb AND the JSON flat encoders
  (pj/pjs/sj) — the JSON path only looked symmetric because native
  `JSON.stringify` happens to drop function values.
- **No new diagnostics.** Method members stay silent skip slots, matching the
  standalone object walks (the VE011/VL011 "methods aren't data" warnings are
  the lint family's job); only property-with-function-CHILD keeps the existing
  FunctionPropDropped warning. Diagnostics goldens stay byte-stable.
- **The O6 decode-OOB flavor is the same family**: with the guard present the
  encoder writes no bytes for a function-carrying key and leaves its presence
  bit unset, so the decoder reads exactly what was written. Seeded nondata
  soaks over the fixed binary (RT_FUZZ_SEED=1, the finding stream) run clean;
  the earlier post-fix soak failure did not reproduce uncontended and matched
  the TR1 compile-timeout signature (the soak ran concurrently with the full
  Go + JS suites).
- **Pins:** `TestBuildFlatLayout_MethodMemberMarksStrippedCandidate` (both
  spellings: method-signature member AND property-with-function-child) and
  `test/features/binaryUnionFunctionMemberArm.test.ts` (reduced O7 repro, the
  SharedArrayBuffer soak shape on every arm, the JSON twin, and the marker
  pair).

## Symptom

Two related failures on the SAME structural family — a union whose arm
carries a function-typed member beside its literal discriminant — found by
the nondata fuzz soak (O6/O7 oracles), both reproducible and both
format/negation-free (verified with a de-formatted twin: swapping every
format/not leaf in the generated type for plain `string` reproduces
byte-for-byte the same failure).

1. **Decode out-of-bounds (O6).** Soak seed `3727573161`
   (`RT_FUZZ_SEED=1` stream, nondata lane): mock takes the
   `{kind: 't2', f0: () => SharedArrayBuffer}` arm of a three-arm
   discriminated union; `binaryEncode` succeeds, `binaryDecode` throws
   `Offset is outside the bounds of the DataView` (DataView.getUint8 past
   the written buffer) — the encoder wrote fewer bytes than the decoder
   reads for the all-members-dropped arm.
2. **Uncontrolled encode throw (O7 class).** A reduced three-arm union
   (`{kind:'t0', f1: string} | {kind:'t1', f0?: string} | {kind:'t2',
   f0: () => …}`) encoding `{kind: 't2', f0: fn}` throws
   `The "src" argument must be of type string. Received function f0` —
   the arm dispatch fed the function member to `serString` (wrong arm
   selected, or the t2 arm's member table kept the dropped member).

A NON-union object with the same members (`{kind: 't2', f0: () => …}`)
round-trips fine — the defect is specific to the union arm tables.

## Repro

```ts
// exact: packages/ts-runtypes/test/fuzz — replay the nondata value phase
const gen = withSeededRandom(3727573161, () => genType(NONDATA_GEN_OPTIONS));
// compileType(client, gen); mock under withSeededRandom(mixSeed(3727573161,'value',0))
// → binaryEncode(value) → binaryDecode(wire) throws OOB.
// reduced (encode-side): the three-arm union above with value {kind:'t2', f0: fn}.
```

## Fix plan

1. Diff the emitted `tb` vs `fb` code for the union (emitMode 'both' —
   the harness captures both) and pin where the arm layouts disagree:
   dropped (function-typed) members must be absent from BOTH tables, and
   the arm selector must key on the literal discriminant, not member
   structure.
2. Check the sibling families (jsonEncode handled the same value fine —
   the JSON path drops the member symmetrically; mirror its member-drop
   rule into the binary arm tables).
3. Regression tests: union-with-function-member-arm encode/decode
   round-trip in the binary suite, plus the reduced encode case; both
   `getRunTypeId` call shapes per the marker rule if a new suite file is
   added.

## Provenance

Pre-existing engine behavior — surfaced 2026-08-01 by the fuzz soak after
the format/negation leaves reshuffled the seeded generation stream
(de-formatted twin reproduces identically, so the new leaves are not
involved). Same exposure pattern as
[tb-noop-predicate-class-stripped-members.md](tb-noop-predicate-class-stripped-members.md).
