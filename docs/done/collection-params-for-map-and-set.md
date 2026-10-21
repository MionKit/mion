---
type: feature
spec: full-plan
status: done
created: 2026-09-12
---

# One collection params bag: contains and uniqueItems on Map, FormattedCollectionParams

## Problem

`FormattedSet` takes the whole array bag (`packages/run-types/src/formats/structural.ts`), but
`FormattedMap` takes only the two count keys (`FormattedMapParams`, structural.ts:128, a `Pick`
of `minItems` / `maxItems`). That leaves a Map without two checks it needs for the same reason a
Set does:

- **`uniqueItems`.** A Map dedupes keys by identity, so two object keys equal by content are two
  entries: `new Map([[{id: 1}, 'a'], [{id: 1}, 'a']]).size` is 2. On the wire that is
  `[[{id: 1}, 'a'], [{id: 1}, 'a']]`, which JSON Schema `uniqueItems` rejects. The rule for a Map
  is the JSON Schema rule over the entries: no two `[key, value]` pairs equal by value. Two
  content-equal keys with different values are two different pairs and pass.
- **`contains`.** A Map is an array of `[key, value]` pairs on the wire, so `contains` on a Map is
  a TUPLE child checked against each entry; `unknown` / `any` in a slot skips that slot:

      type Roles = TF.FormattedMap<Map<string, Role>, {contains: ['admin', unknown]}>;
      type Scores = TF.FormattedMap<Map<string, number>, {contains: [unknown, 100]; maxContains: 1}>;

The bag itself is still called `FormattedArrayParams` while three wrappers share it. Rename it
`FormattedCollectionParams` (a Map is not a list, so `List` was rejected), keep the old name as a
deprecated alias for one release (the convention `packages/run-types/src/index.ts:69` uses for
`FriendlyType`), and fold `FormattedMapParams` into the shared bag.

## Plan

### 1. The type-first surface (`packages/run-types/src/formats/structural.ts`)

- Renamed `FormattedArrayParams<Contains>` to `FormattedCollectionParams<Contains>`, with
  `/** @deprecated … */ export type FormattedArrayParams<Contains = unknown> = FormattedCollectionParams<Contains>;`.
- `FormattedMap` gained `ContainsSlot<P>` exactly like `FormattedSet`.
- `FormattedMapParams` survived, but as a CONSTRAINT rather than the old `Pick`:
  `FormattedCollectionParams<readonly [unknown, unknown]>`, the whole bag with the one
  type-carrying slot narrowed to the pair a Map entry is. Left unconstrained (as it first shipped
  in this change), `{contains: number}` on a Map compiled happily and produced a validator that
  ALWAYS REJECTS, because a non-pair child matches no entry so the count never leaves 0. Nothing
  downstream can tell that from a deliberately strict constraint, so the error belongs at the call
  site. `FormattedMapParamsValueFirst` is its value-first twin
  (`FormattedCollectionParams<RunType<readonly [unknown, unknown]>>`), and `FormattedMapFrom`
  extracts against the narrowed bag.
- `FormattedArrayParamsValueFirst` became `FormattedCollectionParamsValueFirst` (deprecated alias
  kept). `FormattedSetParamsValueFirst` was DROPPED rather than re-aliased: an array and a Set take
  the one bag verbatim, and the name was new on this branch and never published. The internal names
  (`ArrayLiteralKeys`, `ArrayLiteralPart`, `ArrayParamsType`) renamed to `Collection…`. An array and
  a Set keep the UNCONSTRAINED slot on purpose: their entry is a single value of any type.
- `packages/run-types/src/formats/index.ts` exports the new names and the aliases;
  `packages/run-types/src/builders/compose.ts` (`array` 90-107, `map` 342-370, `set` 372-390) and
  `ts-go-runtypes/internal/convert/print.go` (the comment at 415-420) follow the rename.
- The `map` builder's second overload (compose.ts:357-363) takes the shared bag, so
  `RT.map(k, v, {contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]}), uniqueItems: true})`
  type-checks against `ExactParams`.

### 2. Go: `contains` on a Map (`ts-go-runtypes/internal/cachegen/typefunctions/`)

- `containsLoop` (validate.go) takes `SubKindMap` beside `SubKindSet`: same
  `for (const ciN of v)` head and `v.size` count, only `expected` differs (`map`). A Map's default
  iterator yields `[key, value]` arrays, so the tuple child compiles against the loop variable
  unchanged. The errors lane calls the same helper, so it followed for free.
- The collapses already promote a `__rtContains` member onto any builtin class base
  (`cachegen/runtype/intersection_collapse.go` `splitBuiltinClassBrand`,
  `typeid/intersection_collapse.go` `splitBuiltinClassBrandID`, both Map-agnostic); nothing to do.
- `collectionformat.go`: the `unique bool` field is gone; both families read `uniqueItems`, each
  naming its OWN predicate through a `uniquePureFn` field (`uniqueItemsCheck` takes the pure-fn
  name). Its nil-context fallback stays family-agnostic on purpose: `for…of` walks an array, a Set
  and a Map alike, so the one inlined IIFE that serves the direct emitter tests needs no copy per
  family.
- `rt::uniqueItems` was SPLIT into one predicate per family plus the shared key they all
  depend on (`packages/run-types/src/runtypes/pure-fns-utils.ts`): `rt::uniqueArrayItems`,
  `rt::uniqueSetMembers`, `rt::uniqueMapEntries` and `rt::canonicalJson`. One rule, three walks:
  the three collections disagree on what an entry is and on what is already unique by
  construction, so a function each keeps every emitted module to the walk its own base needs (an
  array-only program ships no Set or Map arm) and drops the runtime kind test. The Map walk skips
  pairs whose key is a primitive, unique by construction under SameValueZero, which is what stops
  a `Map<string, BigObject>` canonicalising every value for nothing. `canonicalJson` is named for
  the hand-written twin the mock walker uses (`mocking/structuralFormat.ts`), which it must agree
  with or mocks drift from validators. Table regenerated with
  `pnpm miondevx core codegen builtinpurefns` (46 entries).

  Two traps the split walked into, both worth knowing before touching a pure fn:
  - A returned function cannot recurse by its OWN name: a factory body is inlined without its
    lexical environment, so the self-reference reads as an outer capture and the purity checker
    fails it with `PFE9011`. The recursion rides a factory-local const instead.
  - The dependency edge is recognised through the `CompTimeArgs<string>` brand on `getPureFn`'s
    first parameter, so `utl` must be typed as the real `RTUtils` (a type-only import, so the file
    stays runtime dependency-free). A hand-rolled local shape with a plain `string` parameter
    compiles and reads fine but records `deps: nil`, and the emitted module then never imports the
    dependency and throws when called.
- Schema output: `collectionBag(node, false)` (`schemadoc/render.go:565-583`) already appends
  `structuralParts`, and `contains` renders through `node.Contains` generically (a tuple child
  prints as `{type: 'array', prefixItems: […]}`), so a bounded Map prints `contains` and
  `uniqueItems` on its outer array with no renderer change. Pin it in `render_test.go`.
- Convert: `structuralParamsPubliclySpellable` (`convert/print.go`) now has ONE arm for
  `formattedArray`, `formattedSet` and `formattedMap` (the three allowed maps had become
  identical); `contains` already rode `structuralParts` for both roads, so the printers needed
  nothing. `TestChain_BoundedSetAndMap` pins the two new Map chains id-exact both ways:
  `RT.map(RT.object({id: TF.number()}), TF.string(), {uniqueItems: true})` and
  `RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.unknown(), RT.literal(100)]}), maxContains: 1})`.
- Size estimate: unchanged (`maxItems` is already read).

### 3. Mocking and matching (`packages/run-types/src/mocking/`)

- `structuralFormat.ts` `structuralFormatAccepts`: the Map arm became
  `value instanceof Map && itemKeywordsAccept([...value], params)` (a spread of a Map yields its
  pairs, which IS the entry list the keywords read).
- `mockType.ts`: the "matched entries first, then rejected fillers" loop came OUT of `mockSet`
  into a shared `drawCollectionEntries`, and both arms now call it. The Map arm draws a pair per
  `contains` entry and inserts with `result.set`.
- `childMatch.ts` needed nothing: a Map's contains child is a tuple, which `matches` already
  handles, and `containsSatisfied` is reached from the array and tuple arms only (there is no
  class arm at all, which is unchanged by this work).

### 3b. Two things found while building the mock arms, both fixed here

- **A drawn entry that collapses on insert.** Both arms finish by inserting into the collection,
  which dedupes: `new Set(members)` drops a repeated primitive member and `result.set(key, …)`
  overwrites a repeated key. A `contains` with `minContains: 2` over a narrow member or key type
  could therefore under-satisfy silently and ship a mock the validator rejects, with nothing to
  catch it (a contains-only node carries no format annotation, so `mockSwitch` never
  reject-samples it). `drawCollectionEntries` now rejects a draw whose insert key is already
  taken and redraws it, and throws a named error only when the redraws run out. This was a
  pre-existing `mockSet` defect, fixed on the same code path rather than filed.
- **An `unknown` slot in a Map's `contains` tuple.** Mocking the tuple child produces a concrete
  value for that slot, which the Map's own key / value type then rejects, so the honest-looking
  `{contains: ['admin', unknown]}` would have thrown "contradictory". The Map arm's `drawMatch`
  now REDRAWS any half the Map's own type rejects, from that type, and re-checks the repaired
  pair against the child; only a pair that still fails is a real contradiction
  (`{contains: [number, unknown]}` on a `Map<string, …>`).

### 4. Docs and examples

- `container/website/content/02.runtypes/02.guide/02.type-formats.md` option table: the "On"
  column reads `every collection` for `minItems` / `maxItems` / `uniqueItems` / `contains` /
  `minContains` / `maxContains`, and a sentence defines an entry (an array item, a Set member, a
  Map's `[key, value]` pair) and says `unknown` marks the half you do not care about.
- `packages/examples/src/guide/structural-formats.ts` `start-collections`: a Map with
  `contains: ['admin', unknown]` and a Map with object keys and `uniqueItems: true`.
- `14.json-schema-generation.md` (the bounded Map / Set sentence): `contains` and `uniqueItems`
  ride the outer array for a Map too.
- Every comment and title that said "the array keywords" of a Set or Map now says "the
  collection keywords"; nothing outside `structural.ts` still names `FormattedArrayParams`.

## Tests

Marker rule: every case pairs the type-first spelling with its builder twin, both
`getRunTypeId` shapes.

- `packages/run-types/test/suites/format-validation/StructuralFormat.ts`: `map_unique`
  (`Map<{id: number}, string>` with `uniqueItems: true`; invalid `new Map([[{id: 1}, 'a'], [{id: 1}, 'a']])`,
  valid `new Map([[{id: 1}, 'a'], [{id: 1}, 'b']])`), `map_contains` (`{contains: ['admin', unknown]}`),
  `map_contains_value` (`{contains: [unknown, 100]; maxContains: 1}`, invalid: two perfect
  scores), each through the 12-lane matrix with the `RT.map(…, {…})` twin in `validateSchema`
  and `expectedFormatErrors` naming `formattedMap` / `contains`.
- `test/suites/value-first-define/index.ts`: the two Map builder cases.
- `test/suites/format-validation/CollectionBuilders.test.ts`: the Map twins with `contains` and
  `uniqueItems` equal their type-first ids; both deprecated aliases still name the renamed bags
  (compile-time `Equal`).
- `test/types/structural.test.ts` `assertionsMapContainsTakesAPair`: the pair shapes accepted, and
  a bare entry type / three slots / one slot / an optional slot REJECTED, in both spellings, pinned
  with `@ts-expect-error` (a directive that stops firing reds the file with TS2578). This is the
  right home because every failure in the class is silent.
- Go: `collectionformat_test.go` (`TestFormattedMap_IgnoresUniqueItems` REPLACED by a both-families
  `TestCollectionFormats_UniqueItemsGoesThroughThePureFn`, plus `uniqueItems` in the Map errors
  expectation), `collection_format_module_test.go` (`TestCollectionFormat_ContainsIteratesAMapWithForOf`),
  `render_test.go` (a Map carrying `uniqueItems` plus a `contains` pair on the outer array),
  `roundtrip_test.go`, and the pure-fn table sync.
- `test/types/builderCost.compile.test.ts`, `dataonly` / `stripmeta` compile tests: rename only;
  budgets untouched.

## Docs

Section 4 above. No new page.

## Fuzzing

`packages/run-types/test/fuzz/core/typeGen.ts`: `MapStructural` and `mapStructuralParams` are
gone. `ArrayStructural` became `CollectionStructural` (one bag, matching the shipped type) and
`withMapStructural` draws it whole; `collectionStructuralParams(structural, containsChild)` takes
the pinned child, so a Map renders `contains: [unknown, number]` where an array and a Set render
`contains: number`. The convert lane's id-convergence oracle then covers Map `contains` and
`uniqueItems` both ways. Verified with `MION_FUZZ_ITER=60` on `convertFuzz.integration.test.ts`
and `pnpm miondevx core fuzz convert`.

## Out of scope

- A "no two entries share a value" keyword for a Map (not JSON Schema; no use case yet).
- `patternProperties` / `propertyNames` on Map keys.
- Removing the two deprecated aliases (`FormattedArrayParams`, `FormattedArrayParamsValueFirst`);
  they go at the next release after this ships, like the other renamed exports.

## Done when

- `TF.FormattedMap<Map<K, V>, P>` takes `FormattedCollectionParams` whole, and `contains`
  (tuple child, `unknown` slots skip), `minContains` / `maxContains` and `uniqueItems` (pairs
  compared by value, primitive keys skipped) validate, report errors, mock, convert both ways
  and print in the JSON Schema output, each equal to its `RT.map` twin's id.
- `FormattedCollectionParams` is the exported name and `FormattedMapParams` is its
  pair-constrained narrowing (a non-pair `contains` on a Map is a TYPE ERROR, not a validator that
  always rejects); `FormattedArrayParams` and `FormattedArrayParamsValueFirst` still resolve as
  deprecated aliases; the unpublished `FormattedSetParamsValueFirst` is gone.
- The suite cases, builder cases, Go tests and fuzz shapes above are in; `pnpm test`,
  `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint`,
  `pnpm miondevx core codegen all --check` green; the docs rows and examples updated.
