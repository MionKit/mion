---
type: bug
spec: mini-plan
status: SHIPPED
created: 2026-08-01
shipped: 2026-08-02
---

# tb noop predicate disagrees with the emitter on classes carrying stripped members

## Shipped

One-arm fix in `toBinaryNoopRecursive` ([noop_types.go](../../ts-go-runtypes/internal/cachegen/typefunctions/noop_types.go)):
the `KindClass`/`SubKindNone` arm now returns non-noop for any NAMED plain
user class, mirroring `jsonNoopRecursive`'s existing rule. Regression table
rows in `noop_types_test.go` pin all four corners (named + stripped member,
named + literal-only member, anonymous twin, interface twin); the type-fuzz
lane replays clean (zero tripwire lines).

**Decisions logged:**

- **The predicate was the wrong side, and the defect is WIDER than stripped
  members.** `wrapToBinaryWithClassSerializer` unconditionally emits the
  runtime class-serializer registry branch for every named class (a
  registered `serialize` may write a JSON-string frame at run time), so a
  compile-time "writes nothing" claim is unsound for ANY named class whose
  members happen to be no-write slots — `declare class C {p: never}` and
  `declare class C {p: 'lit'}` alike. The fix keys on `userClassName`, not
  on stripped-member detection, and the emitter is untouched (its body was
  always correct; classes keep interface-parity member dropping).
- **Anonymous classes and interfaces keep claiming noop** — they skip the
  wrapper, so identity stays true and the short-form entry remains.
- **Sibling-family audit came back clean:** the json prepare/restore/compact
  predicates already carry the named-class rule (`jsonNoopRecursive`
  SubKindNone arm + the union flat-layout walk), and `fb` has no noop
  predicate at all (fromBinary always assigns `ret`). Only the tb arm had
  the hole.
- **No wire-layout impact:** the tb verdict feeds only `IsNoopType`'s
  short-form-vs-live-body choice in module.go; no byte-layout decision keys
  off it, so flipping named-class verdicts is behavior-preserving (the
  tripwire was already demoting the lie at compile time).

## Symptom

The protective tripwire in
[module.go](../../ts-go-runtypes/internal/cachegen/typefunctions/module.go)
(`noop-predicate mismatch … IsNoopType claims identity but the compiled body is
not — shipping the live body`) fires for the `tb` (toBinary) family whenever a
**class** declares a non-optional property of a DataOnly-stripped kind:

```ts
declare class C0 {p0: never}          // tb_u2YQKq6 — tripwire fires
declare class C0 {p0: symbol}         // tb_yQkm0Sm — tripwire fires
declare class C0 {p0: Promise<string>} // tb_Vrz1tfd — tripwire fires

interface I0 {p0: never}              // fine — no mismatch (same for symbol / Promise)
```

Runtime behaviour stays CORRECT — the tripwire demotes the bogus noop verdict
and ships the live body — but every compile of such a class logs the warning,
and the predicate/emitter drift it guards against is real.

Found by the type-fuzz lane after the format/negation leaves landed in
`test/fuzz/core/typeGen.ts` (the added leaves shifted the seeded generation
stream, so batch seed `0xc0ffee` iteration 21 started producing
`declare class C0 {p0: never}`). The defect itself PREDATES that work — it
reproduces on the engine with fuzz changes stashed and involves no format or
negation nodes.

## Root cause (both arms located)

- Predicate: [noop_types.go](../../ts-go-runtypes/internal/cachegen/typefunctions/noop_types.go)
  `toBinaryNoopRecursive` — the `KindProperty` arm returns **noop** when the
  member's child `isStrippedUnionMember` (symbol / never / Promise /
  function-like / non-serialisable class,
  [union_strip.go](../../ts-go-runtypes/internal/cachegen/typefunctions/union_strip.go)),
  mirroring DataOnly stripping. `KindClass` with `SubKindNone` walks members
  through the same `toBinaryNoopObjectChildren`, so the whole class claims
  identity.
- Emitter: [binary_to.go](../../ts-go-runtypes/internal/cachegen/typefunctions/binary_to.go)
  `KindNever` / `KindSymbol` / `KindPromise` return `CodeNS` (the reference
  runtime throws, e.g. "Never type cannot be serialized to Binary"). On the
  INTERFACE path the member walk drops the stripped member and the body stays
  identity (predicate and body agree); on the CLASS path the emitted body ends
  up non-identity, so `shapeNoop` is false and the tripwire fires.

## Fix plan

1. Pin the intended semantics from the hand-written reference runtime
   (`packages/ts-runtypes/src/**/binary/toBinary.ts`): does a CLASS instance
   with a stripped member serialize like the interface twin (member dropped,
   identity when nothing else writes) or throw?
2. Align whichever side is wrong:
   - if members should drop (interface parity): fix the CLASS member walk in
     `emitObjectToBinary` so the compiled body is byte-identical to the
     interface case, and the predicate stands;
   - if classes should throw: make `toBinaryNoopRecursive`'s `KindClass` arm
     return false when any member resolves to a stripped kind (do NOT touch the
     objectLiteral arm — interfaces agree today).
3. Audit the sibling family predicates that reuse the stripped-member shortcut
   (`fb`, json prepare/restore, compact, cloning) for the same
   class-vs-interface disagreement — same repro shapes, one scratch sweep.
4. Regression tests: Go emit test pinning predicate == body-shape for
   `declare class {p0: never | symbol | Promise<…>}` AND the interface twins;
   both `getRunTypeId` call shapes per the marker coverage rule if a JS suite
   is added.

## Evidence / repro

```
pnpm exec vitest run typeFuzz.integration   # batch seed 0xc0ffee, i=21 (post-format-leaf stream)
# or directly: compile `declare class C0 {p0: never}` + createBinaryEncoderFn<C0>()
# via the fuzz harness — the resolver stderr prints the tripwire line.
```
