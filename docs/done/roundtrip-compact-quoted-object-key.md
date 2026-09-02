---
type: fix
spec: guidelines
status: done
created: 2026-09-02
---

# Compact codec loses an object whose key contains a double quote

## Intent

The roundtrip fuzz soak (`fuzz soak · roundtrip` in `release-gate.yml` and `fuzz-soak.yml`)
found 4 violations, all on one generated type, all in the COMPACT format. A value like

```json
{"kind":"t1","f0":[{"with\"quote":true}]}
```

comes back from the compact round-trip as

```json
{"kind":"t1","f0":[[true]]}
```

The object with the quoted key turns into a bare array, `validate` rejects the decoded value,
compact disagrees with clone and with the native JSON projection, and the wire is not stable.
The other codecs (json, binary, clone) agree with each other, so this is a compact encoder or
decoder bug around escaping a `"` inside an object key, most likely in the key table or the
object/array discrimination.

Found on 2026-09-02 by the release gate on PR #201 (run 33579204363, seed `0xd179ff0b`).
Predates that branch, which touches no codec code.

## Direction

- Replay: `MION_FUZZ_SEED=0xd179ff0b pnpm rtx core fuzz roundtrip --soak`. The violating
  type is logged as `({1}|{2}|{1}|{1}) (seed=2792797093)` with the four `RT-*/compact`
  oracle names; the fuzz harness under `packages/run-types/test/fuzz/roundtrip/` can
  regenerate that one type from its per-type seed.
- Reduce it to a hand-written feature test first (a union arm whose object has a key with a
  `"` in it, nested in an array), so the fix is pinned by a deterministic test and not only
  by the fuzzer. Follow the Marker test coverage rule in `ts-go-runtypes/CLAUDE.md` if the
  test goes through the marker API.
- Then fix the compact codec (the Go emitter and its JS twin, whichever side owns key
  escaping) and confirm the seeded soak passes.

## Done when

- The reduced feature test passes and the compact round-trip of a quoted-key object equals
  the clone / json results.
- `MION_FUZZ_SEED=0xd179ff0b pnpm rtx core fuzz roundtrip --soak` reports 0 violations.
- `fuzz soak · roundtrip` is green on `main`.

## Plan, compact union envelope (implemented 2026-09-02)

Planned and built by the delegated background session; no interactive plan approval was
available, so the plan below is the one that shipped.

### What was actually wrong

The quote was incidental. The compact strategy reuses the flat-union encode / decode of the
keyed strategies, and those drop the `[idx, value]` / `[-1, merged]` envelope on a union
whose members are all plain JSON data (`roundTripsRaw`), leaving the decoder as the
identity. Compact still turns every NESTED object into a positional array, so for

```ts
type T = {kind: 't0'} | {kind: 't1'; f0: [{'with"quote': boolean}]} | {kind: 't2'} | {kind: 't3'};
```

the encoder wrote `{"kind":"t1","f0":[[true]]}` and the identity decoder handed the array
straight back. Every union of plain objects with a nested object (array, tuple, record or
direct) failed the same way, quoted key or not. There is no JS twin of this codec; the fix
is Go only.

### Fix

- `union_flat_compact.go` (new): `compactUnionNeedsEnvelope` answers "does any surviving
  member positionalize something?", asking each keyed member's property / index-signature
  values and each atomic member whole through the existing cjr noop predicate. It mirrors
  `unionJsonNoop`'s member walk instead of `buildFlatLayout` so the predicate never emits
  duplicate drop diagnostics, and threads the caller's cycle set.
- `buildCompactFlatLayout` widens `AtomicNeedsTuple` with that verdict; both compact union
  arms build their layout through it, so encode and decode agree on the wire.
- `emitUnionPrepareForJsonSafe` / `emitUnionRestoreFromJsonFlat` gained layout-taking
  variants; the keyed strategies keep the raw round-trip and the record-union optimisation.
- `compactFromJsonNoopRecursive`'s union arm now also requires "no compact envelope", so
  the noop gate cannot elide the decode it just started emitting.

Unions where nothing positionalizes (`Record<string, number> | {kind: 'x'}`) stay a bare
object on compact exactly as before.

### Tests

- Go, `union_flat_compact_test.go`: rendered compactForJson / compactFromJson modules for
  the nested-object union (envelope + positional `[v.b.c]` + unwrap), the record-of-numbers
  union (still bare, noop entry), the atomic-only `{c: string}[] | string` (arms wrapped),
  each contrasted with the keyed family staying raw; plus the helper's verdicts.
- Go, `noop_types_test.go`: three new predicate fixtures pinning cjr false / rj true.
- Go, `noop_predicate_test.go` corpus: four union shapes so the mechanical
  predicate-vs-emitter soundness pin covers the rule across every family.
- JS, `suites/serialization/CompactUnionEncoding.test.ts`: the soak shape and the
  reduced shapes, asserting the compact wire and the round-trip, with the marker
  coverage pair (value-first `createJsonEncoderFn(value, …)` versus static
  `createJsonEncoderFn<T>(undefined, …)`, and both `getRunTypeId` shapes on one id).
- JS, `suites/serialization/Unions.ts`: a `union_nested_object_member` case run through
  every encoder x decoder pairing, binary and the value-first schema variants.
- JS, `fuzz/type/compactUnionNestedObject.smoke.test.ts`: seven shapes through all five
  lanes of the roundtrip harness, checking round-trip, validate and cross-lane agreement.
- Seeded soak: `MION_FUZZ_SEED=0xd179ff0b pnpm rtx core fuzz roundtrip --soak`.

### Docs

None. The site does not describe the compact union wire, and the user-visible promise
(compact round-trips like the other strategies) is unchanged; this restores it.
