# JSON Schema × RunTypes — Phase 2.2: derived `createJsonSchemaFn<T>()` output (proven)

- **Status:** investigation complete — working prototype committed
- **Prototype:** `packages/ts-runtypes/test/features/jsonSchemaOutput.proto.ts` (+ `.test.ts`, 17 tests green)
- **Verdict: viable.** A complete draft 2020-12 emitter exists as a JS-side walker over the
  reflected RunType graph; production should promote it to a Go emitter family (analysis §4),
  keeping the walker as the parity oracle.

## 1. What the prototype is

`runTypeToJsonSchema(getRunType<T>(), options)` walks the knotted node graph (the exact
architecture of the mock walker, the one existing runtime interpreter) and emits the **wire
projection** of `T` per the Phase-1 mapping, with the DataOnly discipline:

- non-data members (symbol / function / method / callSignature / promise / never /
  non-serializable natives / RegExp values) **drop with a Warning at property position**
  and **throw at root/propagating positions**;
- wire forms for `Date` (ISO `date-time`), Temporal (per-type formats where RFC 3339
  allows), `bigint` (digit-string + pattern);
- `Map`/`Set` **throw by default** (per the DataOnly instinct in the original brief) with an
  explicit `{mapSet: 'wire'}` opt-in emitting the JSON family's real wire shape (entry
  pairs / array + `uniqueItems`);
- formats → hard keywords where 2020-12 has them (min/max/length/pattern/enum/not-enum,
  minimum/maximum/exclusives/multipleOf, `type: integer`, format names for
  uuid+version-pattern / email / hostname / ipv4 / ipv6 / uri / date / time / date-time /
  duration), Warnings where it does not (pattern flags, decomposed email/domain
  sub-validators, date/bigint bounds, non-ISO layouts, `float`);
- recursion through `$defs`/`$ref` keyed by the node's structural id (`isCircular` nodes are
  hoisted; the self-reference in the emitted document is a real `$ref`).

## 2. What the 17 tests prove

Objects with required/optional inversion + `readOnly` + format keywords on a realistic DTO;
both `getRunTypeId` call shapes and both `getRunType` shapes (marker coverage rule);
literals → `const`; TS enums → `enum` (values); unions → `anyOf` (incl. `null` arms and
literal unions); records → `additionalProperties`; tuples → `prefixItems` + `minItems`
(optional members) + `items: false`/`maxItems` (fixed) vs `items: <rest>` (rest); Date and
bigint wire forms; Map default-throw + wire opt-in for Map and Set; non-data property drops
with warnings vs propagating throws; `$defs`/`$ref` recursion for a self-referential tree
type; and a full **round-trip with the Phase-2.1 input prototype** (schema → type →
schema preserves structure, required set and formats).

## 3. Reflection-graph facts learned (they shape the production design)

1. **Tuple rest** members are `tupleMember` nodes carrying `flags: ['rest']` whose `child`
   is the ELEMENT type.
2. **Map/Set type args** ride the `arguments` slot as `KindParameter` wrappers with
   subKinds `mapKey`/`mapValue`/`setItem` — not `typeArguments`, not `children`.
3. **Function-typed properties** (`callback: () => void`) reflect as `methodSignature` —
   the checker's view — so the method-drop path covers them; there is no
   propertySignature-holding-function shape to special-case.
4. **Template literals** have no JS-side regex: the anchored regex is composed inside the
   Go validate emitter. A faithful JS emitter would duplicate that logic — a concrete
   argument for the Go-side family (or for exporting the composed regex on the node).
5. **Demand**: reflection graphs ship only for reflection roots (`FnId == ""` sites —
   `getRunTypeId`/`getRunType`/builders/`createMockDataFn`). A runtime-walker
   `createJsonSchemaFn` must therefore register as a reflection-demanding fnKey; a Go
   emitter family instead ships a per-type constant and no graph.

## 4. Production shape: Go emitter family vs JS walker

| | Go emitter family (`jsonSchema`, tag e.g. `jsc`) | JS runtime walker (prototype as-is) |
| --- | --- | --- |
| Diagnostics | **Real build diagnostics** through the catalog (new `JSC0xx` codes; 001–009 root Errors, 010+ property Warnings — the established numbering), alwaysThrow entries for root errors | Runtime throws/warnings only — violates the Warning/Error *build* discipline that the whole feature leans on |
| Payload | Per-type constant module (tree-shaken like any entry; no walker, no graph) | Ships the walker + the reflection graph |
| Reuse | Template-literal regex builder, jsquote, canonicalization, disk cache, `--check` lanes — all free | Duplicates the regex builder; no disk cache |
| Cost | The standard new-family checklist (9 Go touchpoints + codegen regen; enumerated in the migration plan) | Near-zero beyond a reflection fnKey |
| Options | Compile-time variants via the existing axis machinery (`mapSet`/`closed`/`target` fork the fnHash exactly like `ValidateOptions`) | Runtime options object |

**Recommendation:** Go emitter family for the shipped `createJsonSchemaFn<T>()`, with this
JS walker kept in-tree as the **reference twin** — parity-pinned against the emitted
constants the way the EditBuffer Go⇄JS twins and the enrichgen shared leaf are (drift
becomes a failing test, and the walker doubles as the playground/WASM-light path).
Severity assignments per position follow the Phase-1 verdict table; the emitted document
is a static constant per (typeId, options-variant).

## 5. API sketch

```ts
// factory form, consistent with every family; the returned fn is a memoized constant
const userSchema = createJsonSchemaFn<User>()();
// options are compile-time (fork the variant hash, like ValidateOptions):
createJsonSchemaFn<User>({mapSet: 'wire', closed: true, vendorExtensions: true});
```

- Return type: a structured `JsonSchemaDocument` type (not a per-`T` mapped literal — that
  would re-pay the type-level cost for no inference value on the OUTPUT side).
- `closed: true` emits `additionalProperties: false` / `unevaluatedProperties: false`
  (intersections), documented as the `validate + hasUnknownKeys` pairing.
- `vendorExtensions: true` unlocks the AJV `formatMinimum`/`formatMaximum` bound carriers
  and `x-` annotations (enum names, currency) per the Phase-1 tables.
- Root `$id`/`$defs` naming: structural id (readable `typeName` prefix when present) —
  hash-consing maps 1:1 onto `$defs`, shared entries dedupe for free.

## 6. Open items carried to the plan

- AJV conformance lane in `container/benchmarks` (emit schema → compile with
  `ajv/dist/2020` → mock values from `createMockDataFn` must validate; invalid mocks must
  fail) — the cross-validator soundness proof that cannot live in the workspace (AJV is
  container-only by policy).
- `enum` member-name annotation option (`anyOf`+`const`+`title` or `x-enumNames`).
- Non-ISO date/time layout → derived `pattern` tables (mechanical, deferred).
- Number-key `patternProperties` and template-literal-key emission (needs the Go regex).
