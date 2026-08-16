---
type: feature
spec: guidelines
status: ready
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
