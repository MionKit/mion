---
type: feature
spec: guidelines
status: done
created: 2026-08-16
---

# StandardJSONSchemaV1: emit JSON Schema documents from types and builders

## Problem

Producing a JSON Schema from a type is near-required for any validation library
(OpenAPI docs, AI tool-calling, cross-tool interop). The Standard Schema spec
(https://github.com/standard-schema/standard-schema) now defines
`StandardJSONSchemaV1`: a `~standard.jsonSchema` converter with
`input(options)` / `output(options)` methods returning a JSON Schema document.
We already implement `StandardSchemaV1` (`createStandardSchema`; both
interfaces are designed to coexist on one `~standard` object), and the whole
TS→schema mapping already exists as the convert lane's printer
(`ts-go-runtypes/internal/convert/printschema.go`, ~1,040 lines) — it prints TS
source today; this feature re-targets the same mapping to emit a JSON document
into the runtime cache.

## Plan

1. **Vendor the spec types** in `packages/ts-runtypes/src/standard/spec.ts`
   (same flattened, zero-dependency style as the existing `StandardSchemaV1`
   aliases): the typed-base props, `jsonSchema: Converter`
   (`input(options)` / `output(options)` → `Record<string, unknown>`), and
   `Options` (`target`, optional `libraryOptions`).
2. **New fn family** (working name `'jsonSchema'`), registered exactly like
   `'val'` / `'verr'` / `'jsonEncoder'`: the family-name union in
   `packages/ts-runtypes/src/markers.ts`, the fn-hash codegen
   (`ts-go-runtypes/cmd/gen-fn-hashes`), and the typefunctions emitter
   registry (`ts-go-runtypes/internal/cachegen/typefunctions/`). The cache
   entry is a compiled type-fn whose body returns the schema document for `T`
   (a frozen object literal) — rides the existing entry-tuple machinery
   (`packages/ts-runtypes/src/runtypes/entryTuple.ts` sync boundary), no new
   tuple kinds.
3. **Go emitter via a shared leaf**: extract `printschema.go`'s
   RunType→schema mapping into a shared leaf that BOTH the convert printer
   and the new cache emitter call (the enrichment pattern —
   `internal/enrichment/enrichgen` exists so the CLI verb and the daemon op
   can never drift). The leaf produces a schema tree; the convert printer
   renders it as TS source, the cache emitter as a JS object literal.
   Dialect: emit draft 2020-12 plus the JS-extension rows (`jsType`,
   `rtFormat`, temporal params) by default — the extension documented in
   `container/website/content/02.guide/12.json-schema-js.md`.
4. **Respect the existing dialect flag**: convert already has
   `Options.Portable` (`--portable`, diagnostic CNV006) which forbids the
   dialect. Map `options.libraryOptions: {portable: true}` on the runtime
   converter to the same semantics: return the document without dialect
   keywords; where an identity exists ONLY in dialect form (`jsType`-only
   nodes: bigint, Date, Map/Set, functions, undefined/void), throw with the
   CNV006 message rather than silently emitting a wrong schema — mirroring
   the printer's behavior.
5. **API surface**:
   - `createStandardSchema<T>()` grows the converter: marker becomes
     `InjectTypeFnArgs<T, 'val', 'verr', 'jsonSchema'>`
     (`packages/ts-runtypes/src/standard/createStandardSchema.ts`), and the
     returned `~standard` gains `jsonSchema` — one object satisfying both
     `StandardSchemaV1` and `StandardJSONSchemaV1`. `input()` and `output()`
     return the SAME document (no transforms; we validate the `DataOnly<T>`
     projection).
   - A standalone `createJsonSchemaFn<T>()` (same family, marker
     `InjectTypeFnArgs<T, 'jsonSchema'>`) returning
     `(options?) => Record<string, unknown>` for callers that only want the
     document. Both the run-type (builder value) and type/value reflection
     call forms, mirroring `createValidateFn`.
   - `options.target`: accept `'draft-2020-12'`; throw a clear error for
     other targets (`draft-07`, `openapi-3.0` are out of scope).
6. **No-plugin fallback** mirrors the other factories: a converter that
   throws with the standard "plugin not configured" guidance.
7. **Design decision — where `input()` and `output()` actually differ.** The
   spec's split describes a transform boundary, and ours is the
   `prepareForJson` / `restoreFromJson` pair. Two possible `validate`
   semantics; the implementer must pick and design accordingly:
   - **Check-only** (what `createStandardSchema` ships today): no
     conversion, so `input()` === `output()`, but the document describes the
     JS-typed shape (real `Date`, `bigint`), which portable JSON Schema
     cannot honestly express — only the jsType dialect can.
   - **Restore mode (preferred direction)**: `validate` accepts the WIRE
     JSON value and returns the restored JS value — the parse-equivalent
     (Zod's flagship `parse` also validates + transforms in one step; its
     `~standard.validate` wraps `safeParse`). Then `input()` is the wire
     schema — ALWAYS expressible in PORTABLE standard JSON Schema (the wire
     is JSON by definition: dates as `{type: 'string', format:
     'date-time'}`), so the input side never needs the dialect and never
     hits the portable error — and `output()` is the JS-typed schema
     carrying the jsType dialect. Precedent: Zod's `z.toJSONSchema` has an
     `io: 'input' | 'output'` option; its output side THROWS on
     JS-only types like `z.date()` ("unrepresentable") where our dialect
     can actually describe them, and consumers (e.g. LangChain tool
     calling) explicitly want the input/wire side. `input()` is the
     flagship artifact (OpenAPI, AI tool-calling, interop). This matches
     how standard-schema consumers (tRPC, Hono, forms) actually use
     `validate`: parsed JSON in, typed value out.
   Caveats for restore mode: the shipped `createStandardSchema` is
   check-only (its `validate` returns the SAME object, narrowed), so restore
   semantics need an opt-in (comptime option or a sibling factory). And the
   ORDER is inverted vs Zod-style validate-then-transform: our `'val'`
   validator checks the JS-typed shape (`instanceof Date`, `typeof bigint`),
   so a wire value fails it before any restore. Two shapes:
   - restore-then-validate: reuse `'val'` on the revived value — cheapest,
     but `restoreFromJson` assumes roughly-valid input, and issues would
     describe the half-restored object, not the JSON the caller sent;
   - a FUSED validating decoder (preferred): one walk that checks each
     slot's WIRE form and revives it, recording wire-accurate issues —
     "parse, don't validate". Fits the existing per-(typeId, strategy)
     composite machinery the `jsonDecoder` family already uses; it is a new
     composite family.
8. **`JSONShape<T>` — the wire type.** Restore mode needs a type-level wire
   shape: a sibling of `DataOnly<T>` (same mapped-type pattern,
   `packages/ts-runtypes/src/runtypes/dataOnly.ts`) applying the leaf wire
   mappings (`Date`/Temporal → string, `bigint` → string,
   `Map<K, V>` → `[K, V][]`, `Set<V>` → `V[]`, `RegExp` → string, …) exactly
   as the Go serializer emits them. Primary use: it fills the standard
   schema's phantom `types.input` slot — the restore-mode schema is
   `StandardSchemaV1<JSONShape<T>, DataOnly<T>>`, and `InferInput` over that
   slot is how consumers (tRPC, TanStack Form, Hono) type request bodies;
   without it Input degrades to `unknown`. Secondary: it pins the
   serializers via a three-way agreement tests/fuzz can check —
   `prepareForJson` output conforms to `JSONShape<T>`, the emitted
   `input()` schema describes `JSONShape<T>`, `restoreFromJson` maps it
   back to `DataOnly<T>`. Known cost: one more TS⇄Go leaf-mapping twin to
   keep in sync; the agreement checks are its drift alarm.

## Tests

- Paired marker-rule tests (static `createJsonSchemaFn<T>()` AND reflection
  `createJsonSchemaFn(value)`), with one hash-equivalence assertion.
- A suite pinning emitted documents for representative types: atoms,
  literals/enums, formats (`format`/`pattern`/bounds), structural params
  (`contains`, `patternProperties`, `propertyNames`, min/max bounds), unions
  (`anyOf`), tuples (`prefixItems`), recursion (`$defs`/`$ref`), and the
  dialect rows for JS-only types.
- Portable behavior: dialect stripped; `jsType`-only node throws CNV006.
- Structural conformance: the returned object is assignable to both vendored
  spec interfaces; unknown target throws.
- Go side: shared-leaf tests asserting printer/emitter parity (same schema
  tree from both callers), `go -C ts-go-runtypes test ./internal/...`.

## Docs

- New website guide page for JSON Schema generation (createStandardSchema's
  converter + createJsonSchemaFn + the portable option), following the
  website style rules.
- `container/website/content/02.guide/12.json-schema-js.md` reframed around
  what we EMIT (it currently frames the extension as input dialect).
- `docs/ARCHITECTURE.md`: note the shared schema-emit leaf and the new family.

## Fuzzing

Candidate with a cheap oracle: for fuzz-generated types, (a) emission is
deterministic, and (b) in the container bench lane (where ajv already exists
as a competitor dep), AJV compiled on the emitted PORTABLE document agrees
with `createValidateFn` on generated values for the serializable subset —
compare-to-a-trusted-source. Reuse the existing fuzz type generator.

## Out of scope

- `draft-07` / `openapi-3.0` targets.
- Any change to JSON-Schema-as-input (that removal is
  `remove-json-schema-input.md`, which depends on this spec landing first —
  specifically on the printer mapping being extracted into the shared leaf).
- OpenAPI-specific vendor options.

## Done when

- `createStandardSchema<T>()` returns an object satisfying both
  `StandardSchemaV1` and `StandardJSONSchemaV1`; `createJsonSchemaFn<T>()`
  exists; both respect `libraryOptions.portable` and reject unknown targets.
- Documents emitted for the whole supported type space match the convert
  printer's mapping (shared leaf, parity-tested).
- `pnpm test` + Go tests green; website docs updated; PR-readiness gate met.

## Plan — incremental implementation (approved 2026-08-17, revised same day)

REVISION (user decision, recorded): the restore-mode direction is REJECTED —
no transform inside validation functions, ever. Reasons: the standard's
input/output split only serves transforming validators; the output side (a JS
value) is not expressible in JSON Schema at all (Zod's own answer is to throw
"unrepresentable"); framework adoption of StandardJSONSchemaV1 is near-zero
today; and the serializer's flat-union envelope means the existing restore
primitive reads the RUNTYPES wire, not the plain JSON a third-party client
sends, so a composed restore would not have served the standard-schema use
case anyway. `validate` stays check-only; `input()` and `output()` return the
SAME document (wire-first + jsType dialect; `libraryOptions: {portable: true}`
strips the dialect keys — one rule, no input/output asymmetry). `JSONShape<T>`
is kept, decoupled from the standard: it types the RunTypes JSON wire
(createJsonEncoderFn output / createJsonDecoderFn input) and its tests pin the
Go serializer wire at type + runtime level.

Steps (each fully tested + committed before the next):

1. `JSONShape<T>` mapped type (`runtypes/jsonShape.ts`, DataOnly-style) with
   leaf wire mappings verified against the Go serializer emitters (flat-union
   envelope included: wrapped unions spell `[number, memberWire]`); type pins
   in test/types + runtime wire-conformance in test/features against the real
   encoder, both marker call shapes.
2. Go `internal/schemadoc` leaf: printschema's format-keyword helpers move
   there (printer rewired, behavior-identical); new standalone document
   renderer with `$defs`/`$ref` cycles; F1–F17 parity test + a parity leg in
   the Go convert fuzz sweep.
3. `jsc` cache family: operations row + CacheModules entry + Families row +
   emitter delegating to schemadoc; codegen regen; emission + plugin
   injection tests.
4. JS surface: vendored StandardJSONSchemaV1 interfaces, portable strip
   walker (one rule: strips dialect keys; unknown target throws),
   `createJsonSchemaFn<T>()`, converter on `createStandardSchema` with
   `input() === output()`; validate untouched.
5. Website guide page + 12.json-schema-js reframe + ARCHITECTURE.md; spec
   reconciled and moved to docs/done; a standalone (standard-free) follow-up
   todo filed for natural-JSON parse via a fused validating decoder.

## Shipped (2026-08-17)

Landed on `feature/standard-json-schema-v1` as five commits, one per step:

1. `JSONShape<T>` (`runtypes/jsonShape.ts`) — the JSON wire twin of DataOnly
   (Date/Temporal/RegExp to strings, bigint to digit strings, Map/Set to
   arrays, undefined slots to null, wrapped unions as `[number, memberWire]`
   envelopes). Type pins + runtime conformance against the real encoder.
2. `internal/schemadoc` — the convert printer's format vocabulary extracted
   into a shared leaf (printer rewired behavior-identically) plus the runtime
   document renderer (`RenderDocument`: total, degrade-with-warnings,
   `$defs`/`{$ref: '#'}` cycles, structural classes, enum value lists).
   Printer/renderer parity pinned by a hand corpus and a seeded fuzz leg
   (`SchemaParityProbe`) — the fuzzing this feature ships.
3. The `jsonSchema` (`jsc`) cache family — operations row, CacheModules
   entry, whole-document emitter; codegen mirrors regenerated.
4. The JS surface — vendored StandardJSONSchemaV1 interfaces,
   `createJsonSchemaFn<T>()`, and the `~standard.jsonSchema` converter on
   `createStandardSchema` (one object satisfies both standard interfaces).
   `input()` and `output()` return the SAME document; `libraryOptions:
   {portable: true}` deep-strips the dialect keywords; non-2020-12 targets
   throw. 296 new feature tests (goldens + full cross-suite sweep).
5. Website guide page (Generating JSON Schema), JSON Schema JS page updated
   to name the generator as an emitter, ARCHITECTURE.md.

NOT shipped, by explicit decision recorded above: transform-inside-validate
(restore mode) and any input/output asymmetry — `validate` stays check-only.

ADDENDUM (same day): union documents describe THE ENCODER'S WIRE. The
flat-union envelope (`[index, value]`, object members merged under index -1)
is a deliberate strength of the serializer, so the generated documents spell
it out rather than the natural anyOf form: the jsc emitter projects the REAL
buildFlatLayout into the renderer (schemadoc.UnionWireLayout), wrapped unions
render their envelope arms with `jsType: 'union'`, raw unions stay natural —
exactly matching what createJsonEncoderFn writes in each case. Pinned by Go
emission tests and a runtime agreement suite (jsonSchemaUnionWire.test.ts)
whose structural validator accepts every encoder output and rejects the
natural spelling for wrapped unions. A schema-conforming sender therefore
speaks the decoder's wire, unions included; the briefly-filed
natural-json-parse todo was withdrawn as contrary to this decision.
