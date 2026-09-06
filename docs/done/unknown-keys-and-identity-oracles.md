---
type: feature
spec: guidelines
status: done
created: 2026-09-06
---

# Two oracles: unknown-key functions agree, and identity checks follow one rule

## Intent

Several generated functions decide what an "unknown key" is, each with its own
emitter. They have drifted from each other more than once, and always in the
same way: a position the merged-allowlist walk did not reach. A class member of
a union was the latest, found by hand while fixing the encode side; the root vs
union answers differed for strip, hasUnknownKeys and unknownKeyErrors alike.
Hand-written tests only cover the positions someone thought of. A fuzz oracle
covers the positions nobody thought of.

## Direction

One rule, checked on random types and random values:

- `hasUnknownKeys(v)` is true exactly when `unknownKeyErrors(v)` is non-empty.
- The paths `unknownKeyErrors` reports are exactly the keys the public strip
  blanks, and exactly the keys the decoder's `strip` blanks on the encoded wire
  of the same value.
- A value with no extras is clean for all of them; a value with one extra key
  planted at ANY depth is flagged by all of them, with the same path.

The type generator must reach every position that has its own arm in the
emitters: root object, union member (object AND named class, registered or
not, base and subclass instance), nested property, array item, tuple slot, Map
value, Set member, index-signature object (the documented carve-out), and the
discriminated union with a shared literal key. Classes need the same
registration on both sides of the decoder round trip.

Extend the existing lane rather than starting one: the value fuzz under
`packages/run-types/test/fuzz/value/` already generates conforming values and
an extras stream, and `fuzz/cloning/cloneOracle.ts` shows the oracle shape
(properties, never expected outputs). Family keys live in
`packages/run-types/src/runtypes/entryTuple.ts`; the shared union walk they all
compile through is `emitUnionUnknownKeysMerged` in
`ts-go-runtypes/internal/cachegen/typefunctions/unknownkeys_union.go`.

## A second oracle: identity checks in generated code follow one rule

The emitted code compares a value's identity in exactly three ways, and a
review of every emitter found them consistent. Pin that so it stays true:

- A JavaScript built-in (`Date`, `RegExp`, `Map`, `Set`, `Temporal.*`) is
  checked with `instanceof` against the global constructor.
- A user class is checked by EXACT constructor (`v?.constructor === cs.cls`)
  in the union encoders' class arms, and by structural shape everywhere else.
  No `instanceof` against a user class, anywhere.
- Nothing compares `constructor.name`.

This is a static rule over emitted text, so it belongs with the existing
generated-code oracles (`GC-GUARD` and siblings in
`packages/run-types/test/fuzz/security/generatedCodeOracle.ts`) as one more
named rule, `GC-IDENTITY`.

## Done when

- A seeded fuzz run over the positions above reports no disagreement between
  the unknown-key functions, and a deliberately broken emitter (drop one arm)
  makes it fail on the first seed.
- The lane runs in the fuzz-unit config and in CI's fuzz job like its siblings.
- `GC-IDENTITY` is a named generated-code oracle, green over the corpus and the
  security fuzz lane, and an emitter that writes `v instanceof MyClass` or
  `constructor.name` trips it.

---

# What shipped

## Correction to the intent above: there are not four functions

The spec named four, including `unknownKeysToUndefined` (`uku`). That public
factory no longer exists. The set that actually decides what an unknown key is:

| Function | Family | Reach |
| --- | --- | --- |
| `createHasUnknownKeysFn` | `huk` | public |
| `createUnknownKeyErrorsFn` | `uke` | public |
| `createCloneExactShapeFn` | `ces` | public, the replacement for `uku` |
| decoder `strategy: 'strip'` | `jdST`, which composes `rj` + `ukuw` | public; `ukuw` is the only surviving user of the `uku` emitter |
| `{checkUnknowns: true}` validators | `vst` / `vest` | public, they reuse `huk` / `uke` |

The user asked for all of them, public or not, so the lane covers all five.

## Part 1 — the unknown-key agreement oracles (O22 to O25)

Extends the existing `value` lane, so no lane registry, env var, CI or workflow
change was needed.

**`packages/run-types/test/fuzz/value/unknownKeyPositions.ts`** is a second
extras walker beside `cloning/extrasValue.ts`, which stays untouched because
the clone oracle depends on its conservative contract. The new one reaches
every position that has its own arm and labels each:

- `flagged` — root object, union member object, union member class, nested
  property, array item, tuple slot, Map key, Map value, Set member.
- `carveOut` — an index-signature object, and the WHOLE union when any member
  carries one (the emit no-ops for the family there).

It plants ONE key (`__fz_uk_<n>`) so a disagreement names the exact position,
and it spells its paths the way `unknownKeyErrors` spells them, including the
`{key, failed}` segment for a Map or Set entry.

**Four oracles in `value/fuzzOracle.ts`**, run as a fifth `unknownkeys` phase
in `value/fuzzRunner.ts`:

| Id | Property |
| --- | --- |
| O22 | `hasUnknownKeys(v)` is true exactly when `unknownKeyErrors(v)` is non-empty (both blind variants, so it also runs on junk) |
| O23 | a key planted at a `flagged` position is reported at exactly that path; at a `carveOut` position it is reported by neither |
| O24 | the paths `unknownKeyErrors` reports are exactly the keys `cloneExactShape` drops |
| O25 | undeclared keys planted on the encoded wire do not change what the `strip` decoder returns |

**Seven new targets** in `value/fuzz.integration.test.ts`: a registered class in
a union, an unregistered one, a subclass instance under its declared base, a
class as a plain property, objects inside an array / tuple / Set, an index
signature next to named properties, and a discriminated union whose arms share
a literal key.

**Anti-vacuity.** The report carries `unknownKeys.{flagged, carveOut, wire}`
counters and the test asserts each is non-zero, so a green run cannot be green
because nothing was planted. A separate deterministic test pins that a planted
wire key really reaches the wire: `preserve` hands it back, `strip` blanks it.

**`value/unknownKeyPositions.unit.test.ts`** pins the walker against hand-built
graphs under the fuzz-unit config, no Go binary.

### Three things the implementation had to work around

1. **The strip pre-pass blanks, it does not delete.** An undeclared wire key
   comes back as an own key holding `undefined`. O25 drops undefined-valued own
   keys on both sides before comparing; a decoder that left the VALUE in place
   is still caught.
2. **A union with object members has no clone at all** (CES001: the emitter
   cannot know which arm to rebuild). Those targets supply no `clone`, so O24
   skips them and O25 covers the strip side of a union instead.
3. **`preserve` cannot keep an extra key on a registered class arm** — that
   instance is rebuilt from the type, never from the keys on the wire. So the
   anti-vacuity half of O25 is a deterministic test rather than a per-value
   check.

O25 is also skipped for any target carrying an index signature: it plants
blindly on the wire, and a key planted into an index-signature object IS
declared.

## Part 2 — `GC-IDENTITY`

One more named rule in `test/fuzz/security/generatedCodeOracle.ts`, running
wherever its siblings run (the `secgen` lane and the hand-written corpus in
`test/features/generatedCodeAudit.test.ts`). Three checks over the
literal-stripped body:

1. Every `X instanceof Y` has `Y` in the built-in allowlist. The Temporal half
   of that allowlist is DERIVED from the shipped subkind table rather than
   restated, so a new Temporal type is allowed the day it is added. The left
   side may be any accessor and the right side may carry one dot.
2. Every `.constructor ===` compares against `/^cix_[A-Za-z_$][\w$]*\.cls$/`,
   the class-serializer registry lookup. The left side may be an optional chain.
3. `constructor.name` never appears.

The corpus had no user class, so nothing in it emitted a class arm. A
registered class union was added to it, plus an assertion that at least one
scanned body carries `?.constructor === cix_`, so the rule cannot go vacuous.
Negative controls live beside the existing ones in
`security/generatedCodeOracle.unit.test.ts`.

## Also fixed

A stale comment in `ts-go-runtypes/internal/cachegen/typefunctions/union_flat_layout.go`
described the class arm as `cs_<name> && v instanceof cs_<name>.cls`. The code
emits `cix_<id> && v?.constructor === cix_<id>.cls`, and the design note two
hundred lines below says the `instanceof` arm is deliberately absent.

## Negative controls, run and reverted

Both were run against a deliberately broken emitter, and neither is committed.

1. Making `unionMergedPropsWithClasses` return `layout.MergedProps`
   unconditionally (the exact shape of the bug commit `72c7063` fixed by hand)
   makes O23 fail on the FIRST seed of `ClassUnionRegistered`:
   `a key planted at a flagged position should be reported as [__fz_uk_790] but
   was reported as []`.
2. Emitting `v instanceof cix_<id>.cls` instead of `v?.constructor ===
   cix_<id>.cls` trips `GC-IDENTITY` on eight bodies across the `pj`, `pjs`,
   `sj` and `tb` families.

## Not done

Nothing from the spec was cut. Two limits are recorded above rather than
worked around: O24 cannot see a union (no clone exists for one), and O25 is
skipped where an index signature is present.
