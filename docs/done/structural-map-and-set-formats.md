---
type: feature
spec: full-plan
status: done
created: 2026-09-11
---

# Structural Map and Set formats on the array keywords

## Problem

Nothing bounds a `Map` or a `Set`. `RT.map` / `RT.set` take no params bag and no type-first
wrapper exists, while arrays and objects have `FormattedArray` / `FormattedObject`
(`packages/run-types/src/formats/structural.ts`) with one params bag each.

PR #268 (https://github.com/MionKit/mion/pull/268, branch `feature/sized-collections`, one
commit) adds `FormattedMap` / `FormattedSet` in one shot, with its own vocabulary
(`minSize` / `maxSize`), two one-off params interfaces, no `uniqueItems` / `contains` for a Set,
three sugar aliases (`List`, `SizedMap`, `SizedSet`) and overloaded builders. It also leaves gaps:
the JSON Schema output drops the bounds, the size estimator ignores them, `DataOnly<T>` drops the
brand, and a `contains` slot on a Set base is silently lost by the intersection collapse.

Decisions taken with the maintainer:

1. **Both collections reuse the ARRAY keywords.** On the wire and in the generated JSON Schema a
   Set is an array and a Map is an array of `[key, value]` pairs
   (`ts-go-runtypes/internal/schemadoc/render.go:311-324`), so `minItems` / `maxItems` land in
   the schema under the standard names, the size estimator reads the same key it reads for
   arrays, and one Go helper serves all three families. A Set takes `FormattedArrayParams`
   whole (`minItems`, `maxItems`, `uniqueItems`, `contains`, `minContains`, `maxContains`); a
   Map takes the two count keys of that same bag. `uniqueItems` on a Set is meaningful: a
   `Set<{id: number}>` holds two structurally equal members today while the generated schema
   already promises `uniqueItems: true`.
2. **No sugar aliases.** Only `FormattedMap` / `FormattedSet` ship, like the array/object family.
3. **One signature per builder** was the plan; it was built, measured and rejected. `set(item,
   params?, id?)` with `const P extends Bag = {}` type-checks and both marker shapes resolve, but
   it costs on every row of the type-cost budgets (`test/types/builderCost.compile.test.ts`, a
   one-way ratchet): +7 first-call instantiations per builder even with a result type gated on
   the empty bag, +4 per call with a bag, about +95 on each utility wrapper, +111 on nested
   arrays. The maintainer chose to keep the overloads; `map` / `set` copy the `array` pattern
   and the measurement is recorded in the budget file's rejected list.

## What happens to PR #268

Keep the branch and the PR (its description and the three review threads are the history).
Rewritten as the eight commits below and force-pushed with lease. The three review threads
are answered: the two "why an overload" threads with the budget measurement above (the overload
is what keeps a bare call at its plain type cost), the "similar options" thread with "Set takes
FormattedArrayParams, Map its count keys". PR #265
(https://github.com/MionKit/mion/pull/265) is stacked on this branch and reads `maxSize` in
`ts-go-runtypes/internal/cachegen/jsonsize/jsonsize.go:454-469`; after this lands it rebases and
switches to `maxItems`.

Survives from the PR: the two emitters registered under `KindClass` (`mapsetformat.go`, renamed
and reworked), `IsStructuralAnnotation` in `schemadoc/leaf.go`, the convert printer helpers
(`printbuilder.go` / `printtype.go`), the `StripRunTypeMeta` Map / Set arm, the
`StructuralFormat.ts` case shape, the class-guard fix and its test.

Dropped: `minSize` / `maxSize`, `FormattedMapParams` / `FormattedSetParams` as new interfaces,
`SizeLiteralKeys` / `MaxMinBag`, `List` / `SizedMap` / `SizedSet`, the `typeid/formats.go`
merge-key rows for `minSize` / `maxSize` (the array keys are already there), `clampToSizeBounds`,
the sugar docs paragraph and its example block.

## How a structural format reaches the generated code (Go, read first)

A branded `Set<T>` reflects as a `KindClass` + `SubKindSet` node carrying
`FormatAnnotation{Name: 'formattedSet', Params: {minItems: 1, …}}`. The brand is lifted off the
`Set<T> & {__rtFormatName?: …; __rtFormatParams?: …}` intersection by `splitBuiltinClassBrand`
(`ts-go-runtypes/internal/cachegen/runtype/intersection_collapse.go:143-157`, `builtinClassNames`
at 421 already lists `Map` and `Set`) and folded into the id by `splitBuiltinClassBrandID`
(`cachegen/runtype/typeid/intersection_collapse.go:135-145`, 321-345). `literalParamsFromType`
(`typeid/formats.go:513`) turns the params literal into the map; `mergeParamValue` (249-252)
already merges `minItems` (max) and `maxItems` (min) when two brands stack. Nothing here changes.

Every lane then finds the emitter by kind and name:

- Registration: `formats.Register(emitter)` keys on `(emitter.Kind(), emitter.Name())`
  (`cachegen/typefunctions/formats/registry.go:209`); `formats.LookupForRunType(rt)` is
  `Lookup(rt.Kind, rt.FormatAnnotation.Name)` (235-240). The `structural` package is already
  blank-imported by `formats/all/all.go`, so a new file in it needs no wiring. The `Emitter`
  interface (registry.go:100-127): `Name`, `Kind`, `EmitValidateCheck(annotation, vλl, ctx)`
  returns a JS boolean EXPRESSION, `EmitValidationErrorsCheck(annotation, vλl, pathExpr,
  errorsArr, ctx)` returns `;`-joined JS STATEMENTS; the optional `ParamValidator`
  (`ValidateParams(annotation) []string`) becomes a `CodeFMTInvalidParams` diagnostic.
- Validate lane (`typefunctions/validate.go:208-227`): the base is `emitSetValidate`
  (1079-1111, a `CodeRB` statement body: `instanceof Set`, `for (const item of v.values())`
  member checks) or `emitMapValidate` (993-1075); `ctx.AsExpression(base)` hoists it into a
  context function and the lane emits `(base && (check))`. The emitter never sees the base.
- Errors lane (`typefunctions/validationerrors.go:100-121`): the base is
  `emitSetValidationErrors` / `emitMapValidationErrors` (436-441, `CodeS`); the lane appends
  `;if (<baseKindGuard>) {<statements>}`. `baseKindGuard` (256-285) is what commit 1 fixes:
  today every class guards with `v instanceof Date`, so no Map / Set statement ever runs.
  Statements are built with `formats.FormatErrCall(pathExpr, errorsArr, expected, name, param,
  val)` (`formats/emit.go:24`), which emits
  `er.push({expected:'set',path:[...pth],format:{name:'formattedSet',formatPath:['maxItems'],val:2}})`,
  the object the JS suite's `expectedFormatErrors` matches by `name` / `formatPathTail` / `val`.
- `contains` is NOT on the emitter. It is a splice on `rt.Contains` (`[]*ContainsCheck{Child,
  Min, Max}`, `reflection/runtype.go:393`) promoted from the `__rtContains` sentinel by
  `typeid.ContainsSpecFromMember` (`typeid/formats.go:455`). `emitContainsCount`
  (`validate.go:318-340`) and the errors count (`validationerrors.go:186-215`) hard-code
  `v[i]` and `.length`, and the errors push hard-codes `expected: 'array'`.
- Lanes that consult the annotation and need NOTHING: `binary_to.go` / `binary_from.go` (only
  emitters implementing the binary encoder / decoder capability), `binary_min_bytes.go` (sizer
  capability), `formattransform.go` (transformer capability), `noop_types.go:863` (an annotation
  only makes a node non-noop), `unknownkeys_shared.go:452` (reads `formattedObject` only),
  `json_stringify.go` / `json_restore.go` / `json_compact*.go` / `must_validate_json.go` (a bound
  never changes the wire shape), `json_schema_doc.go` (delegates to `schemadoc.RenderDocumentWire`,
  so the `render.go` change below covers it), `enrichment/enrich.go:158-162` (`isMap` / `isSet`
  key on kind and subkind, brand-blind).
- Lanes that DO change: `schemadoc/render.go` (JSON Schema output), `binary_size_estimate.go`
  (size estimate), `convert/print*.go` (both convert directions), the two collapses for
  `contains`, the contains loops in `validate.go` / `validationerrors.go`, and the generated
  catalog.

## Plan

### Commit 1: fix the class guard in the errors lane

`baseKindGuard` (`validationerrors.go:271-281`) guards every `KindClass` format check with
`v instanceof Date`. Land the PR's fix (`SubKindMap` → `v instanceof Map`, `SubKindSet` →
`v instanceof Set`, before the Date fallback) and `TestBaseKindGuard_ClassSubKinds`
(`validationerrors_test.go`) as the first commit on its own.

### Commit 2: the type-first surface and the Go emitters

`packages/run-types/src/formats/structural.ts`, inside the `structural-slice` region:

- `FORMATTED_MAP_NAME = 'formattedMap'`, `FORMATTED_SET_NAME = 'formattedSet'`.
- `FormattedSet<Base extends ReadonlySet<unknown>, P extends FormattedArrayParams>`: the exact
  `FormattedArray` encoding over a Set base. The literal keys ride
  `StructuralBrand<typeof FORMATTED_SET_NAME, ArrayLiteralPart<P>>` (added only when at least one
  is present), `contains` rides `ContainsSlot<P>`. Reuse `ArrayLiteralPart` and `ContainsSlot`
  verbatim, no new key lists.
- `FormattedMapParams<Contains = unknown> = Pick<FormattedArrayParams<Contains>, 'minItems' | 'maxItems'>`
  (a Pick, so it can never drift from the array bag) and
  `FormattedMap<Base extends ReadonlyMap<unknown, unknown>, P extends FormattedMapParams>` with
  the brand over `ArrayLiteralPart<P>`.
- Below the region: `FormattedSetParamsValueFirst = FormattedArrayParamsValueFirst`,
  `FormattedMapParamsValueFirst = FormattedMapParams`, `FormattedSetFrom<T, P>` through the existing
  `ArrayParamsType<P>`, `FormattedMapFrom<T, P>` through a Pick of it.
- Export the four types and the two `…ValueFirst` aliases from `packages/run-types/src/formats/index.ts`.

Go, `ts-go-runtypes/internal/cachegen/typefunctions/formats/structural/`:

- Rename the PR's `mapsetformat.go` to `collectionformat.go`: one `collectionEmitter{name,
  expected}` struct registered twice under `reflection.KindClass` (`formattedSet` / `expected:
  'set'`, `formattedMap` / `expected: 'map'`).
- Extract the length half of `arrayConditions` (`arrayformat.go:79-91`) into
  `lengthConditions(params, lenExpr string) []string` reading `minItems` / `maxItems` through
  `formats.ReadNumberParam` + `formats.FormatNumber`; arrays pass `v + ".length"`, the collection
  emitter passes `v + ".size"`. Same extraction for the errors statements
  (`EmitValidationErrorsCheck`, arrayformat.go:106-126) parameterised by `expected` and the family
  name, and for `ValidateParams` (the `maxItems < minItems` message names `FormattedSet` /
  `FormattedMap`). `uniqueItems` on a Set reuses `uniqueItemsCheck` (arrayformat.go:62) as is:
  `rt::uniqueItems` iterates with `for (const item of a)`
  (`packages/run-types/src/runtypes/pure-fns-utils.ts`), so a Set works unchanged and the alias
  is hoisted once per factory through `ctx.UsePureFn`. The Map emitter ignores `uniqueItems`
  and `contains` (its bag cannot spell them, and the Go side stays total by reading only the
  two count keys).

What each keyword generates, per lane (`N` is the literal, `v` the value):

| Keyword | On | Validate expression | Errors statement (`FormatErrCall`) | JSON Schema | Size estimate | Convert |
| --- | --- | --- | --- | --- | --- | --- |
| `minItems` | Set, Map | `v.size >= N` | `if (v.size < N)` push `expected` set/map, name `formattedSet`/`formattedMap`, `formatPath ['minItems']`, `val N` | `minItems: N` on the outer array (`DefaultedStructuralParams` keeps a `0` under `rtFormatParams`) | none | `{minItems: N}` |
| `maxItems` | Set, Map | `v.size <= N` | `if (v.size > N)` push `['maxItems']` | `maxItems: N` on the outer array | entry count `min(cfg.Items, N)` | `{maxItems: N}` |
| `uniqueItems` | Set | `uniqueItems(v)` (the hoisted `rt::uniqueItems` alias) | `if (!uniqueItems(v))` push `['uniqueItems']`, `val true` | skipped: the Set spelling already prints `uniqueItems: true` | none | `{uniqueItems: true}` |
| `contains` + `minContains` / `maxContains` | Set | the contains splice (commit 3): count members whose child check passes, `count >= Min [&& count <= Max]` | the errors splice: `expected 'set'`, name `contains`, `formatPath ['minContains']` / `['maxContains']` | `contains: <child>` (+ `minContains` / `maxContains`) through the existing `structuralParts` over `node.Contains` | none | `{contains: T, minContains: N, maxContains: M}` through the existing `structuralParts` |

- `collectionformat_test.go`: mirror `arrayformat_test.go` for both families: the validate text
  for each bound alone and together, the `uniqueItems` pure-fn alias + `rt::` namespace, the
  errors statements (one per keyword, with `expected` = `set` / `map`), and the `ValidateParams`
  contradiction. Plus a `typefunctions` module test (the `module_test.go` shape) rendering
  `FormattedSet<Set<string>, {minItems: 1; maxItems: 2; uniqueItems: true}>` end to end and
  pinning the emitted validate expression `(<hoisted set body>(v) && (v.size >= 1 && v.size <= 2 && uniqueItems(v)))`
  and the errors body `…;if (v instanceof Set) {if (v.size < 1) er.push(…);if (v.size > 2) er.push(…);if (!uniqueItems(v)) er.push(…)}`.
- Regenerate the catalog: `pnpm miondevx core codegen typeformats` rewrites
  `packages/run-types/src/go-generated/typeFormats.generated.ts` (two `RunTypeKind.class` rows);
  `cmd/gen-type-formats/gen_test.go` pins the file.

### Commit 3: `contains` on a Set base (collapse + both lanes)

Both collapses only recognise `Builtin & {brand}`. `splitBuiltinClassBrand`
(`cachegen/runtype/intersection_collapse.go:428-447`) skips a `{__rtContains?: …}` member
silently, so the slot is lost, and `Set<T> & {__rtContains}` with no brand falls to the object
merge (163+) and loses the Set identity. `splitBuiltinClassBrandID`
(`typeid/intersection_collapse.go:321-345`) drops it the same way.

- Serialize side: in `splitBuiltinClassBrand`, also collect members that
  `typeid.ContainsSpecFromMember` recognises and return them; the caller (152-157) appends a
  `ContainsCheck{Child: cache.Serialize(childType), Min, Max}` per member to `node.Contains`
  after `projectClass`, exactly as the object branch does at 185-186. Accept a class member
  whose only companions are sentinels (brand absent). A `__rtPatternProps` / `__rtPropNames`
  member on a Map / Set base stays ignored, as before: the collapse has no diagnostic channel,
  and no public type can spell one there (`FormattedSet` takes the array bag).
- Id side: `splitBuiltinClassBrandID` returns a `containsKey` built the way the object branch
  builds it (`"c{" + sortedJoin(containsIDs) + "}"`, 218-220) and the id becomes
  `Compute(classMember) + containsKey + formatKey`.
- `emitContainsCount` (`validate.go:318-340`): take the base kind; for `KindClass` + `SubKindSet`
  emit `for (const ci of v)` with `ctx.SetChildAccessor(ci)` and `v.size` for the any-child
  count; arrays and tuples keep the `for (let ci = 0; ci < v.length; ci++)` loop byte for byte.
  The errors count (`validationerrors.go:200-215`) gets the same switch, and the two
  `FormatErrCall(…, "array", "contains", …)` pushes take the base's `expected` word (`set` for a
  Set).
- Go tests: `validate.go` / `validationerrors.go` unit tests that a Set with `contains` emits
  the `for…of` body and the `set` expected word, and that an array's output is unchanged; a
  collapse test proving `Set<number> & brand & contains` keeps `SubKindSet` and carries one
  `ContainsCheck`; a typeid test proving that id differs from `Set<number>` and equals the
  value-first twin's.

### Commit 4: the map and set builders take the bag (overloads kept)

`packages/run-types/src/builders/compose.ts`: `map(key, value, params, id?)` and `set(item,
params, id?)` as second overloads over `FormattedMapParamsValueFirst` /
`FormattedSetParamsValueFirst`, the exact `array` pattern, the `isFormatParams` sniff telling the
bag from an injected id. `array` / `record` / `object` are untouched.

The single-signature shape was built first: the transform pads a skipped optional parameter
with `undefined` (`ts-go-runtypes/internal/compiler/sourcerewrite/transform.go:290-321`) and an
optional `id?:` marker is recognised (`compiler/marker/marker.go:476`), so `set(string())` rewrote
to `set(string(), undefined, id)`, every suite passed, and both marker shapes resolved. It lost on
the type-cost budgets alone (decision 3 above); the numbers live in
`test/types/builderCost.compile.test.ts` next to the other rejected experiments, so the next
person does not re-run it. `map(string, number)` already had a budget row.

### Commit 5: JSON Schema output, size estimator, convert

- `schemadoc/render.go` `classText` (311-324): when `HasStructuralPayload(node)`, append
  `r.structuralParts(node, StructuralAnnotationParams(node))` to the OUTER array literal exactly
  like the `KindArray` branch (272-278), plus `RTFormatParamsSuffix(DefaultedStructuralParams(…))`;
  drop `uniqueItems` from the parts for a Set (the Set spelling already prints it). Keep the
  PR's `IsStructuralAnnotation` names in `leaf.go`. `render_test.go`: a bounded Set prints
  `{type: 'array', items: …, uniqueItems: true, jsType: 'Set', maxItems: 3}`, a bounded Map prints
  `minItems` / `maxItems` next to `jsType: 'Map'`, a `contains` Set prints `contains: <child>`.
- `typefunctions/binary_size_estimate.go` `classBytes` (559-568) uses `e.cfg.Items` for Map and
  Set; read the count through the same `maxItems` clamp `collectionBytes` applies (385-393),
  extracted into `boundedCount(rt)`. `binary_size_estimate_test.go`: a `maxItems: 2` Set / Map
  estimates `2 * element`, an unbounded one still `cfg.Items * element`.
- Convert: keep the PR's `sizedCollectionBuilder` / `sizedCollectionSpelling` renamed
  `collectionBuilder` / `collectionSpelling`; `structuralParamsPubliclySpellable`
  (`convert/print.go:453`) lists `minItems` / `maxItems` / `uniqueItems` for `formattedSet` and
  the two counts for `formattedMap`. Replace `TestChain_SizedMapAndSet` (`roundtrip_test.go`)
  with a chain over `TF.FormattedSet<Set<string>, {maxItems: 3; uniqueItems: true}>`,
  `TF.FormattedSet<Set<unknown>, {contains: number; minContains: 2}>` and
  `TF.FormattedMap<Map<string, number>, {minItems: 1; maxItems: 2}>`, id-exact on both roads
  (`RT.set(TF.string(), {maxItems: 3, uniqueItems: true})` and back).

### Commit 6: mocking, DataOnly, StripRunTypeMeta (JS)

- `packages/run-types/src/mocking/structuralFormat.ts`: `isStructuralFormat` accepts the four
  names; `structuralFormatAccepts` gains a Set arm reading the array keys off `[...value]` (reuse
  `hasDuplicateItems`) and a Map arm reading the count keys off `.size`.
- `mocking/mockType.ts`: extract the array clamp (312-320) into one helper over `minItems` /
  `maxItems` and call it from `mockMap` / `mockSet` (805-835). `mockOversized.ts` needs nothing
  (Map / Set are not descended, a bounded one is never a target).
- `runtypes/dataOnly.ts` needs NOTHING, the spec was wrong here: the sentinel keep-probe
  (`DataOnlySentinelKept`, before the collection ladder) already keeps any branded container
  whole, a branded Set or Map included, exactly like a branded array (the brand marks the exact
  shape the validator was compiled for, so the members are not projected). A re-attach in the
  ladder was written, cost about +350 instantiations on every plain Map (an `Extract` over a
  Map's method keys) and was dropped. `test/types/dataonly.compile.test.ts` pins the kept
  brand, the kept contains slot and the unprojected members.
- `StripRunTypeMeta`: the PR's arm only subtracted the brand, so a contains-only Set stayed
  branded. The collection arm now rebuilds `Map<K, V>` / `Set<U>` (readonly variants kept) from
  the inferred key / value types, dropping every sentinel at once;
  `test/types/stripmeta.compile.test.ts` pins Set, Map, ReadonlySet and a contains-only Set.
- `runtypes/pure-fns-utils.ts` `rt::uniqueItems` was index-based and silently accepted every
  Set; it now walks a Set with `for…of`, canonicalising object members only (primitives are
  unique by construction), the array path byte for byte as before. The built-in pure-fn table
  is regenerated (`pnpm miondevx core codegen builtinpurefns`).

### Commit 7: docs and examples. Commit 8: fuzz lane. (Both below.)

## Tests

Follow the Marker test coverage rule: every case pairs the type-first spelling with its
value-first builder twin, both `getRunTypeId` shapes.

- `packages/run-types/test/suites/format-validation/StructuralFormat.ts`, four cases through the
  12-lane matrix (5 validate, 5 getValidationErrors, 2 mockType): `set_bounds`
  (`{minItems: 1; maxItems: 2}`), `set_unique` (`uniqueItems` over object members, the sample
  `new Set([{id: 1}, {id: 1}])` is invalid), `set_contains` (`{contains: number}` over
  `Set<unknown>`), `map_bounds`. `expectedFormatErrors` names `formattedSet` / `formattedMap` with
  `formatPathTail` `minItems` / `maxItems` / `uniqueItems` / `minContains`; `validateSchema` is
  the builder twin.
- `test/suites/value-first-define/index.ts`: `RT.set(TF.string(), {maxItems: 3, uniqueItems: true})`,
  `RT.set(RT.unknown(), {contains: TF.number()})`, `RT.map(TF.string(), TF.number(), {maxItems: 2})`,
  next to the array cases at lines 144-146.
- `test/suites/format-validation/CollectionBuilders.test.ts`: a bare `set()` / `map()` keeps
  the plain collection id, and each bagged builder equals its type-first twin in both marker
  shapes.
- Compile tests: `dataonly`, `stripmeta` (new blocks, budgets pinned at their measurement),
  `builderCost` (unchanged budgets, the single-signature measurement recorded).
- Go: `collectionformat_test.go`, the module-level render test, the contains loop tests in both
  lanes, the collapse and typeid tests, `render_test.go`, `binary_size_estimate_test.go`, the
  convert roundtrip, `gen_test.go` catalog sync, `TestBaseKindGuard_ClassSubKinds`.
- The GC-GUARD oracle and `must_validate_json.go` need nothing: Map / Set restore arms exist and a
  format never changes the wire shape.

## Docs

`container/website/content/02.runtypes/02.guide/02.type-formats.md`, section "Array and Object
Constraints" (130-170): rename to "Array, Object, Map and Set Constraints"; the wrapper table gains
`Maps` (`TF.FormattedMap<Map<K, V>, {...}>` / `RT.map(key, value, {...})`) and `Sets`
(`TF.FormattedSet<Set<T>, {...}>` / `RT.set(item, {...})`); the option table's "On" column reads
`arrays, Sets and Maps` for `minItems` / `maxItems` and `arrays and Sets` for `uniqueItems`,
`contains`, `minContains` / `maxContains`; one sentence says a Map's count is its number of entries.
No sugar paragraph. `packages/examples/src/guide/structural-formats.ts` gains a
`// start-collections` … `// end-collections` block with a `FormattedSet`, a `FormattedMap`, their
builder twins and the id equality, imported by the page.
`14.json-schema-generation.md` (rows 103-104): note that a bounded Map / Set carries `minItems` /
`maxItems` on the outer array.

## Fuzzing

`packages/run-types/test/fuzz/core/typeGen.ts`: add `withCollectionStructural` next to
`withArrayStructural` (1212-1225) for the `set` shape (the array structural bag: `uniqueItems`,
`maxItems`, `contains`) and the `map` shape (`maxItems`), rendered through the shipped
`TF.FormattedSet` / `TF.FormattedMap` like `arrayStructuralParams` (1360-1372), under the
`structuralFormats` option only. The existing id-convergence oracle (type-first against
value-first) then covers both families; no value lane draws them.

## Out of scope

- The `List` / `SizedMap` / `SizedSet` aliases.
- `patternProperties` / `propertyNames` on Map keys (a Map's key type is already a full type).
- The request-limit work in PR #265, which rebases on this.
- A JSON Schema import door: none exists in the tree, only the output renderer.

## Done when

- `TF.FormattedSet<Set<string>, {maxItems: 3; uniqueItems: true; contains: …}>` and
  `TF.FormattedMap<Map<K, V>, {minItems: 1; maxItems: 2}>` validate, report errors, mock and
  convert in both directions, and each equals its builder twin's id.
- `RT.set(item, params)` and `RT.map(key, value, params)` exist as overloads beside the bare
  forms; bare calls keep their `main` ids; the builder cost budgets are untouched.
- The generated JSON Schema carries the bounds; the size estimator reads `maxItems` on Map / Set.
- `DataOnly` keeps a branded Map / Set whole and `StripRunTypeMeta` recovers the bare
  collection, both pinned by compile tests.
- The four JS cases, the value-first cases, the Go tests and the fuzz shapes above are in;
  `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint`,
  `pnpm miondevx core codegen all --check` are green.
- PR #268 is force-pushed as the series above and its three review threads answered. PR #265
  still has to rebase and switch its `jsonsize` walk to `maxItems`.
