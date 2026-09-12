---
type: feature
spec: full-plan
status: ready
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

- Rename `FormattedArrayParams<Contains>` to `FormattedCollectionParams<Contains>`; add
  `/** @deprecated Renamed to FormattedCollectionParams. */ export type FormattedArrayParams<C = unknown> = FormattedCollectionParams<C>;`.
- `FormattedMap<Base, P extends FormattedCollectionParams>` gets `ContainsSlot<P>` exactly like
  `FormattedSet` (structural.ts:120-124); delete `FormattedMapParams` (structural.ts:128) if
  PR #268 has not shipped in a release yet, else keep it as a deprecated alias of the shared bag.
- `FormattedArrayParamsValueFirst` becomes `FormattedCollectionParamsValueFirst` (deprecated alias
  kept); `FormattedSetParamsValueFirst` / `FormattedMapParamsValueFirst` (structural.ts:222-226)
  become aliases of it. `FormattedMapFrom` (structural.ts:236-239) goes through
  `ArrayParamsType<P>` like `FormattedSetFrom`. Internal names (`ArrayLiteralKeys`,
  `ArrayLiteralPart`, `ArrayParamsType`) rename to `Collection…` in the same pass.
- `packages/run-types/src/formats/index.ts` exports the new names and the aliases;
  `packages/run-types/src/builders/compose.ts` (`array` 90-107, `map` 342-370, `set` 372-390) and
  `ts-go-runtypes/internal/convert/print.go` (the comment at 415-420) follow the rename.
- The `map` builder's second overload (compose.ts:357-363) takes the shared bag, so
  `RT.map(k, v, {contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]}), uniqueItems: true})`
  type-checks against `ExactParams`.

### 2. Go: `contains` on a Map (`ts-go-runtypes/internal/cachegen/typefunctions/`)

- `containsLoop` (validate.go:353-369) adds `SubKindMap` beside `SubKindSet`. The Set arm already
  iterates `for (const ci of v)`; a Map's default iterator yields `[key, value]` arrays, so the
  same head works and the tuple child compiles against `ci` (`Array.isArray(ci) && ci.length === 2 && …`).
  Only `expected` differs: `map`. The errors lane (validationerrors.go:186-220) calls the same
  `containsLoop`, so it follows.
- The collapses already promote a `__rtContains` member onto any builtin class base
  (`cachegen/runtype/intersection_collapse.go` `splitBuiltinClassBrand`,
  `typeid/intersection_collapse.go` `splitBuiltinClassBrandID`, both Map-agnostic); nothing to do.
- `collectionformat.go`: the Map emitter reads `uniqueItems` too (drop the `unique: false` flag:
  one struct, two names, same three keywords).
- `rt::uniqueItems` (`packages/run-types/src/runtypes/pure-fns-utils.ts`, the Set arm added in
  PR #268): add a Map arm before it. `for (const [key, value] of map)`: a primitive key is unique by
  construction, `continue`; an object key canonicalises the PAIR, `canon([key, value])`, into the
  same keyed Set. Regenerate the built-in table (`pnpm miondevx core codegen builtinpurefns`).
- Schema output: `collectionBag(node, false)` (`schemadoc/render.go:565-583`) already appends
  `structuralParts`, and `contains` renders through `node.Contains` generically (a tuple child
  prints as `{type: 'array', prefixItems: […]}`), so a bounded Map prints `contains` and
  `uniqueItems` on its outer array with no renderer change. Pin it in `render_test.go`.
- Convert: `structuralParamsPubliclySpellable` (`convert/print.go:457-468`) gives `formattedMap`
  the same allowed map as `formattedSet` (`uniqueItems` included); `contains` already rides
  `structuralParts` for both roads. Add the Map chains to `TestChain_BoundedSetAndMap`
  (`convert/roundtrip_test.go`): `{contains: ['admin', unknown]; uniqueItems: true}` both ways,
  id-exact.
- Size estimate: unchanged (`maxItems` is already read).

### 3. Mocking and matching (`packages/run-types/src/mocking/`)

- `structuralFormat.ts` `structuralFormatAccepts` (Map arm at 68): read `uniqueItems` over
  `[...value.entries()]` with the same `itemKeywordsAccept` the Set arm uses.
- `mockType.ts` `mockMap` (823+): shape the draw the way `mockSet` does: per `contains` entry,
  mock the tuple child `min` times, check the pair's key and value against `keyType` /
  `valueType` (`childSchemaMatches`), `result.set(k, v)`; fillers that match any contains child
  are dropped; under `uniqueItems`, dedupe pairs with object keys by `canonicalJson([k, v])`.
  Extract the shared "matched entries first, then rejected fillers" loop out of `mockSet` so the
  two arms do not diverge.
- `childMatch.ts`: `contains` on a Map entry matches `[k, v]` against the tuple child through the
  existing tuple arm (71); check `containsSatisfied` is reachable for the class node, else add the
  Map / Set entries walk beside the array call (65-69).

### 4. Docs and examples

- `container/website/content/02.runtypes/02.guide/02.type-formats.md` option table (145-148):
  the "On" column reads `every collection` for `minItems` / `maxItems` / `uniqueItems` /
  `contains` / `minContains` / `maxContains`; one sentence says a Map's entry is its
  `[key, value]` pair, so `contains` takes a pair and `uniqueItems` compares pairs.
- `packages/examples/src/guide/structural-formats.ts` `start-collections` block: a Map with
  `contains: ['admin', unknown]` and a Map with object keys and `uniqueItems: true`.
- `14.json-schema-generation.md` (the bounded Map / Set sentence): `contains` and `uniqueItems`
  ride the outer array for a Map too.
- Wherever the docs or the API reference name `FormattedArrayParams`, say
  `FormattedCollectionParams`.

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
  `uniqueItems` equal their type-first ids; the deprecated `FormattedArrayParams` alias still
  names the same bag (a compile-time `Equal`).
- Go: `collectionformat_test.go` (Map `uniqueItems` emits the pure-fn alias), the contains loop
  tests in `collection_format_module_test.go` gain a Map dump (`for (const ci0 of v)` and
  `expected:'map'`), `render_test.go`, `roundtrip_test.go`, `gen_test.go` (catalog unchanged),
  and the pure-fn table sync.
- `test/types/builderCost.compile.test.ts`, `dataonly` / `stripmeta` compile tests: rename only;
  budgets untouched.

## Docs

Section 4 above. No new page.

## Fuzzing

`packages/run-types/test/fuzz/core/typeGen.ts`: drop `MapStructural` (156) and let
`withMapStructural` (1253) draw the full `ArrayStructural` bag, rendering through
`arrayStructuralParams` with the Map's `contains` child pinned as the tuple `[unknown, number]`
(the array pins `number`). The convert lane's id-convergence oracle then covers Map `contains`
and `uniqueItems` both ways. Run `MION_FUZZ_ITER=60` on `convertFuzz.integration.test.ts` and
`pnpm miondevx core fuzz convert`.

## Out of scope

- A "no two entries share a value" keyword for a Map (not JSON Schema; no use case yet).
- `patternProperties` / `propertyNames` on Map keys.
- Removing the deprecated aliases (they go at the next release after this ships, like the
  other renamed exports).

## Done when

- `TF.FormattedMap<Map<K, V>, P>` takes `FormattedCollectionParams` whole, and `contains`
  (tuple child, `unknown` slots skip), `minContains` / `maxContains` and `uniqueItems` (pairs
  compared by value, primitive keys skipped) validate, report errors, mock, convert both ways
  and print in the JSON Schema output, each equal to its `RT.map` twin's id.
- `FormattedCollectionParams` is the exported name; `FormattedArrayParams` and the
  `…ValueFirst` old names still resolve as deprecated aliases; `FormattedMapParams` is gone or
  aliased per the release state.
- The suite cases, builder cases, Go tests and fuzz shapes above are in; `pnpm test`,
  `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint`,
  `pnpm miondevx core codegen all --check` green; the docs rows and examples updated.
