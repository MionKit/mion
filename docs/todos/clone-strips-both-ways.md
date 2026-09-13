---
type: fix
spec: full-plan
status: ready
created: 2026-09-13
---

# The clone strategy has to strip both ways

## Problem

A route names one `encoder` strategy per direction, but only the encode side honours it.
Every non-compact strategy decodes with the same family (`packages/router/src/types/encoder.ts:42`):

```ts
type DecodeFamily<S> = S extends 'compact' ? 'cjr' : S extends string ? 'rj' : never;
```

`rj` is the plain restore. It shares its object walk with the `mutate` encoder
(`emitObjectJsonChildren`, `ts-go-runtypes/internal/cachegen/typefunctions/json_prepare.go:243`),
transforms the declared members where they sit, and touches nothing else. Put plainly, mion
compiles the PRESERVE decoder for `clone`, a stripping strategy. The Go table names the two
apart (`ts-go-runtypes/internal/constants/constants.go:421`):

```go
"jsonDecoder|strip":    {"rj", "ukuw"},
"jsonDecoder|preserve": {"rj"},        // what clone gets today
```

`clone` promises that undeclared keys are dropped by construction
(`packages/run-types/src/createRTFunctions.ts:349`). That promise only covers the bytes mion
sends. Any other caller (curl, another language, a patched client) posts
`{name, surname, extra}` to a `clone` route and `extra` reaches the handler.

Evidence it really behaves this way: `packages/router/src/dispatch.spec.ts:613` posts exactly
that payload to a default (`clone`) route and `strictTypes: true` rejects it. If the decode
stripped, there would be nothing left to reject.

`compact` already strips both ways because `cjr` rebuilds. `clone` needs the same on a keyed
wire and no family does it:

- `pjs` cannot be reused. It runs value to wire (Date to string) and a decoder needs the opposite.
- `ukuw` + `rj` (what `createJsonDecoderFn`'s `strategy: 'strip'` composes) needs no new family,
  but the pre-pass BLANKS an undeclared key rather than deleting it. `{a: 1, extra: undefined}`
  spread into a database insert still carries `extra`. That is not a guarantee.

### Where the four strategies land

| Strategy | Encode | Decode | Sending | Receiving |
| --- | --- | --- | --- | --- |
| `clone` | `pjs` | `rj` → **`rjs`** | dropped | kept → **dropped** |
| `mutate` | `pj` | `rj` | kept | kept |
| `direct` | `sj` | `rj` | dropped | kept |
| `compact` | `cj` | `cjr` | dropped | dropped |

Only the `clone` row moves. `direct` keeps `rj` deliberately: it writes prototype-named keys onto
the wire on purpose and leans on the decoder refusing them
(`ts-go-runtypes/internal/cachegen/typefunctions/unsafe_keys.go:47-51`), so its pairing is left
alone. Its arrival behaviour becomes a documentation fix, below, not a code change.

## Plan

### The rule this change follows

**Additive only.** One new compiled family, and mion's `clone` decode points at it. Nothing that
exists in RunTypes today changes behaviour: `rj`, `ukuw`, `cjr`, `sj`, `createJsonDecoderFn` and
`createParseFn` all keep working exactly as they do now. A RunTypes consumer who never touches
mion sees no difference. Every edit outside `packages/router` and `packages/core` is a new row, a
new file, or a regenerated mirror.

### The new family

`rjs` (`restoreFromJsonSafe`), the decode mirror of `pjs` (`prepareForJsonSafe`): a restore that
rebuilds the object from the declared shape while applying each child's restore transform. One
walk, undeclared keys gone rather than blanked.

Reachable only through the marker (`InjectTypeFnArgs<T, 'rjs'>`), the way `pjs` and `cjr` are. No
new `createX` factory, and it is NOT wired into any `createJsonDecoderFn` strategy.

Pick the operation `Name` deliberately and never change it: for `AxisNone` the fnHash input is
exactly the Name (`ts-go-runtypes/internal/cachegen/operations/fnhash.go:69-91`), so a later
rename silently rehashes every cache entry.

### The emitter

New `ts-go-runtypes/internal/cachegen/typefunctions/json_restore_safe.go`. Only THREE arms
diverge from `rj`, the same three `cjr` diverges on: `KindObjectLiteral`, `KindClass`/`SubKindNone`
and `KindUnion`. Every other kind calls the existing `rj` helper by name and recursion routes back
through `ctx.CompileChild`, exactly as `CompactFromJsonEmitter` does
(`ts-go-runtypes/internal/cachegen/typefunctions/json_compact_restore.go:71-167`).

The object arm is `emitObjectCompactFromJson` (`json_compact_restore.go:169-250`) with the
positional accessor swapped for a keyed one:

- Slot source: `collectCompactDeclaredSlots` (`json_compact.go:218-266`) already yields the
  declared members in canonical order with `name` / `isSafeName` / `optional` / `childRef`. Its
  `continue` on `KindIndexSignature` (`:241`) and the caller precondition (`:222-225`) need
  relaxing, or a keyed sibling collector.
- Accessor: `propertyAccessor(v, name, isSafeName)` instead of `v[pos]`.
- Guard: an object-shape guard instead of `Array.isArray(v)`. The wire-form guard is not optional,
  it is the `MustValidateJson` rule.
- Rebuild and rebind: keep `const _r = {}; … v = _r;` (`:236-248`).
- `EmitDependencyCall` MUST use the return-capturing form
  (`ctx.emitDepCall(childID, ctx.Vλl, ctx.Vλl)`, `json_compact_restore.go:42-44`). Without it a
  nested `rjs` child rebuilds an object and throws it away.

Three things a rebuild must not lose:

1. **It throws on prototype keys, it does not skip them.** The unsafe-key rule splits by ROLE, not
   by walk shape (`unsafe_keys.go:42-53`): `unsafeKeyThrow` is the decoder rule, `unsafeKeySkip` is
   the rule for an encoder or clone. `rjs` is a decoder that happens to rebuild, so it keeps `rj`'s
   `unsafeKeyThrow` (`json_restore.go:283`) and the sibling-name skip (`:287`, the G1 fix). This is
   the single easiest thing to get wrong by copying `pjs`, and the whole point of the change is
   that the sender is not trusted.
2. **Index signatures follow `pjs`'s model, not `cjr`'s.** `cjr`'s index-signature branch falls
   back to `emitObjectJsonChildren` (`json_compact_restore.go:180-184`), an in-place walk that
   strips nothing. Copying that would silently not strip exactly the shape that matters. The right
   model is `buildSafeIndexSignatureObject` (`json_prepare_safe.go:402-506`), which builds `_r`,
   walks `for (const k in v)`, skips every declared name, and KEEPS the keys an index signature
   legitimately admits. Take its structure and the throw from point 1, not its skip.
3. **The union rule stays three-way consistent.** Compact does not set a flag, it widens
   `AtomicNeedsTuple` before calling the shared body (`buildCompactFlatLayout`,
   `union_flat_compact.go:88-98`), and the same rule is read by the emitters AND the noop predicate
   so the three cannot drift. `emitUnionRestoreFromJsonFlatLayout` (`union_flat.go:335-415`)
   transforms merged props in place and drops nothing, so settle with a test whether letting the
   object MEMBERS strip through `CompileChild` is enough, or whether the arm has to diverge. If it
   diverges it needs the same three-way pairing.

`pjs`'s fastpath carries over: `if (Object.keys(v).length === N) return v`
(`json_prepare_safe.go:395`) is sound here for the same reason, a matching key count means there
are no extras to remove.

### Registry rows, Go

| File | Row |
| --- | --- |
| `internal/constants/constants.go:101-105` | a `CacheModules` row beside `cjr`'s, `VarPrefix: "g_rjs_"`, `Tag: "rjs"` |
| `internal/cachegen/operations/operations.go:196-207` | `{Name: …, FamilyTag: "rjs", Axis: AxisNone, Public: true, FnKey: "rjs"}` |
| `internal/cachegen/typefunctions/families.go:30-88` | one `family(…)` row, before the final `validate` row (:78-79) |
| `internal/cachegen/typefunctions/walker.go:284-299` | one new `factKind` before `factCount` |
| `internal/cachegen/typefunctions/noop_types.go` | `isNoopForRestoreJsonSafe`, modelled on `cjr`'s (:707-820): object arms false, the `restoreKeyGuardReachable` conjunct kept |
| `internal/cachegen/typefunctions/diag_codes.go:160-166` | two DELEGATING methods returning `restoreFromJsonCodes` / `restoreFromJsonRootCodes`. No new codes. Skipping this is the JCP001 trap the comment at :139-151 describes |
| `internal/compiler/resolver/apigen.go:576-581` | `decodeFamily(strategy)`, the Go mirror of the TS map |
| `internal/cachegen/typefunctions/override.go:35-43` | decide deliberately whether `"rjs"` joins the `jsonDecoder` arm (`cj`/`cjr` are absent, a known asymmetry) |

`JsonStrategyFamilies` (`constants.go:409-424`) is NOT touched: no `createJsonDecoderFn` strategy
composes the new family.

Nothing else needs a row. `familyAddedFlags`, `responseAddedFlags`, `familyByFnHash`,
`collectFamilies`, `resolveCrossFamilyEdges` and the disk cache are registry-driven.

### Registry rows, TypeScript

Regenerate first, the rest follows: `pnpm miondevx core codegen fnhashes` and
`… codegen constants` (drift is a CI gate, `.github/workflows/ci.yml:243`).

| File | Change |
| --- | --- |
| `packages/run-types/src/runtypes/entryTuple.ts:520` | `rjs: valueShaped('rjs', noopIdentity)`. Without it a noop entry has no identity fn |
| `packages/run-types/src/createRTFunctions.ts:737-744` | `rjs: RestoreFromJsonFn` in `RTFunctionByKey`, plus the three key-list comments at :499, :711, :757 |
| `packages/run-types/src/markers.ts:50-56`, `index.ts:189, 234-239` | the doc lists naming the primitives |
| `packages/core/src/constants.ts:109-114` | `rjs: getFnHash('rjs')` |
| `packages/core/src/constants.ts:121-122` | `DECODE_FAMILY_BY_STRATEGY` becomes `{clone: 'rjs', mutate: 'rj', direct: 'rj', compact: 'cjr'}`. The comment above it ("only `compact` needs its own decoder") is now false |
| `packages/core/src/runtypes/mionAdapter.ts:35-47` | `MION_FN_KEYS` gains `'rjs'` |
| `packages/core/src/runtypes/mionAdapter.ts:208` | `DECODE_FAMILIES = ['rj', 'cjr']` gains `'rjs'`. The pairing check at :223 fails closed until it does |
| `packages/router/src/types/encoder.ts:42` | `DecodeFamily<S>` maps `clone` to `rjs`, `compact` to `cjr`, everything else to `rj` |

**No runtime change.** Both decode call sites already consume the return value, so an allocating
rebuild is a drop-in: `packages/router/src/dispatch.ts:240-263` assigns it back onto
`request.body[id]`, and `packages/client/src/lib/serializer.ts:223-231` returns it.

## Tests

**Go, will hard-fail until updated:**

- `typefunctions/families_test.go:17` bump the family count, and the arithmetic comment at :14.
- `resolver/noop_predicate_test.go:169-186` add the emitter to the `emitters` map. This is the
  mechanical soundness corpus and the test that catches an unsound predicate.
- `typefunctions/must_validate_json_test.go:25` add the family to `jsonDecodeFamilies`. This is the
  security oracle: an unguarded `new Date(v)` or `new Map(v)` in the new emitter fails here.
- `cmd/gen-fn-hashes/gen_test.go` regenerate.

**Go, new or extended:** a `TestNoopType_…` sibling over the same `noopPredicateTypes` fixtures;
and the family lists in `unsafe_keys_test.go:146` (the prototype-key refusal, which is point 1
above and must be pinned for the new family), `index_sig_sibling_json_test.go:35` (the G1
regression), `pattern_props_codec_test.go:31,47`, `property_dataonly_test.go:56`,
`callable_interface_dataonly_test.go:38,62`.

**JS:**

- `packages/run-types/test/features/getRTFunctionRecovery.test.ts` a new PAIRED static and
  reflection test for `rjs`, per the Marker test coverage rule. The clone pair at :51 / :67 with
  the hash-equivalence assert at :79-87 is the model.
- `getFnHash.test.ts:89-97` the hash literals; `generatedCodeAudit.test.ts:167` the family list;
  `fuzz/security/generatedCodeOracle.ts:227` add `rjs` to `JSON_DECODER_FAMILIES`.
- `packages/core/src/runtypes/mionAdapter.spec.ts:29-59, 200-223` the family sets and the
  fail-closed pairing message.
- `packages/devtools/test/wrapper-strategy-families.test.ts:103-195` a `clone` route now compiles
  `['val','verr','pjs','rjs']`. The `direct` and `compact` expectations are unchanged, which is
  worth asserting rather than leaving implied.
- Router, the behaviour this is all for (`packages/router/src/encoder.spec.ts`): an undeclared key
  posted to a `clone` route never reaches the handler, at the top level and nested, on params AND
  on return; a `mutate` route still receives it; a `direct` route still receives it (pin the gap so
  the next change to it is deliberate); a prototype-named key still throws.

**The `strictTypes` tests flip, and that is this change's job.** With `clone` stripping on arrival
there is nothing left for the unknown-key check to reject on a default route. Update
`packages/router/src/dispatch.spec.ts:613` and its neighbours to assert the new truth: a default
route accepts the payload and the handler sees only declared keys; the rejection case moves to a
`mutate` route. Do not weaken a test to make it pass, restate what it pins.

## Docs

`container/website/content/01.rpc/02.server/08.serialization.md:20-25` has one "Unknown keys"
column, which reads as a property of the strategy. Two of the four rows are only true in one
direction, so split it into what is sent and what is received and fill in all four honestly:
`clone` drops both ways, `mutate` keeps both ways, `compact` drops both ways, and `direct` drops
what it sends but keeps what it receives. Extend the trimmed-return section (:39-45) to say the
same about arrival, not just about what goes on the wire.

The RunTypes decoder pages are unchanged: `createJsonDecoderFn`'s `strip` still blanks, so
`02.runtypes/02.guide/11.decoding-untrusted-input.md:47` stays correct as written.

Check `packages/examples/src/router/` for an example that would now read wrong; none expected.

## Fuzzing

The all-strategy round-trip harness lanes `clone` onto the strip decoder
(`packages/run-types/test/fuzz/roundtrip/roundtripHarness.ts:36-46`), but that lane describes
RunTypes' `strip`, which keeps blanking and is unchanged here. Add an `rjs` lane with two
properties: no undeclared key survives at any depth (inside Map values and Set members included),
and every declared value is identical to what the plain restore produces. The second is the one
that catches a rebuild dropping a member it should have kept.

## Out of scope

Everything in RunTypes that already works. `createJsonDecoderFn`'s `strip` keeps composing
`ukuw` + `rj` and keeps blanking; `createParseFn`'s `strip` keeps `ukuw`; `ukuw` is not retired;
`rj`, `cjr` and `sj` are untouched. The new family is additive and reachable only through the
marker, so no existing RunTypes call site changes behaviour.

Also out: giving `direct` an arrival-stripping decoder, which is only recorded in the docs here.
And making the `huk` / `uke` slots strategy-driven with a lint rule for a `strictTypes` that can
never fire; this change only updates the tests that assert the old behaviour.

## Done when

A `clone` route drops every undeclared key on the way in as well as on the way out, `mutate`,
`direct` and `compact` decode exactly as before, the family is registered on both sides with its
generated mirrors in sync, an index signature still admits the keys it declares, a prototype-named
key on the wire still throws, no existing RunTypes call site changed behaviour, and the tests,
fuzz lane and the serialization page above are in place.
