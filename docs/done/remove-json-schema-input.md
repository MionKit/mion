---
type: feature
spec: guidelines
status: in-progress
created: 2026-08-16
---

# Remove JSON Schema as input (and the oneOf / not / unevaluated brands)

> **Depends on** `standard-json-schema-v1.md` (needs the printer mapping
> extracted into the shared schema-emit leaf first). BREAKING — major bump.

## Problem

The input door serves a weak audience — AJV usage is overwhelmingly
transitive (ESLint, webpack, Fastify internals) or runtime-dynamic, both
unreachable for a compile-time consumer, and the author-facing segment
prefers builder APIs (TypeBox-style), which RunTypes already has natively.
Meanwhile the door carries the full cost of spec conformance: ~24 of ~90
`docs/done/` specs are JSON-Schema bugfixes/gap-closures, plus the official
test-suite triage treadmill. Removal deletes ~9,500–11,000 lines and ends
that treadmill, while the output direction (StandardJSONSchemaV1) keeps
everything it needs.

Measured footprint (2026-08 investigation):

| Bucket | Lines |
|---|---|
| `packages/ts-runtypes/src/json-schema/` | 2,833 |
| `test/suites/json-schema-define/` | 1,698 |
| `test/types/` jsonSchema compile/recovered/harness | 1,283 |
| `test/fuzz/jsonschema/` | 872 |
| `test/json-schema-official/` (incl. triage/divergence data) | ~2,270 |
| `test/playground/jsonSchema.test.ts` | 172 |
| Website guide page 11 + input framing elsewhere | ~500 |
| Convert-lane schema form (recognition, target, CLI, dialect plumbing) | ~1,000–1,500 |
| oneOf / not / unevaluated brand machinery (JS + Go) | ~1,500–2,500 |

## Plan

1. **Delete the input door**: `packages/ts-runtypes/src/json-schema/`
   (`fromJsonSchema.ts`, `runTypeFromJsonSchema.ts`, `embedType.ts`,
   `index.ts`) and the `./json-schema` export in
   `packages/ts-runtypes/package.json`. This alone removes the whole "last
   group" — `if`/`then`/`else`, `dependentRequired`, `dependentSchemas`,
   `$anchor`/`$dynamicAnchor`/`$dynamicRef`, boolean schemas, array-form
   `type`, the `ExactJsonSchema` guard, and `$ref` pointer resolution — all
   of it lives inside `fromJsonSchema.ts`.
2. **Delete input tests**: `test/suites/json-schema-define/`,
   `test/types/jsonSchema.compile.test.ts` +
   `jsonSchemaRecovered.typecheck.ts` + `jsonSchemaHarness.ts`,
   `test/fuzz/jsonschema/`, `test/json-schema-official/` (drop its tsconfig
   from the `typecheck:test` script), `test/playground/jsonSchema.test.ts`,
   the schema-door typecost bench cases under `container/benchmarks/`, and
   the schema cases in
   `packages/ts-runtypes-devtools/test/convert-cli.test.ts`.
3. **Shrink the convert lane to two forms** (type ⇄ builders):
   remove `TargetJSONSchema`, the schema-form recognition/canonicalization
   (`recognize.go`, `canonical.go` schema halves), `--to json-schema` in
   `cmd/ts-runtypes/convert_cli.go`, and the `embedType` import plumbing
   (`imports.go:290`, `names.go:95`). `printschema.go`'s mapping survives
   inside the shared schema-emit leaf (phase 1); `--portable` / CNV006
   semantics live on there. Retire the schema-form CNV codes that no longer
   fire. Update `02.guide/13.source-conversion.md` to two forms.
4. **Remove the three brands** (each: JS surface + sentinel + Go id/runtime +
   printer branch + tests + docs mentions):
   - `oneOf`: `builders/compose.ts` overloads (~line 256+), `OneOf` in
     `builders/static.ts`, `__rtOneOf` sentinel, Go typeid + validate
     branches, schema-leaf `oneOf` emission (unions stay `anyOf`).
   - `not`: `formats/not.ts` (whole file), `NotSlot`, `__rtNot`,
     `NotChildTypeFromMember` + negation runtime in Go
     (`cachegen/typefunctions` negation, typeid handling).
   - `unevaluated*`: `__rtUnevaluated`, the unevaluated params in
     `formats/structural.ts`, the evaluated-set runtime woven through
     `validate.go` / the `unknownkeys_*` family, and convert's
     `unevaluatedDiag`.
5. **Keep untouched**: `contains` / `patternProperties` / `propertyNames`
   (sentinels `__rtContains` / `__rtPatternProps` / `__rtPropNames`, the Go
   structural validators), all length/count bounds, every format (incl.
   `JsonContent` / content-encoding formats), intersection collapse (serves
   TS intersections), and the emitted JS-extension dialect.
6. **Docs**: delete `02.guide/11.json-schema.md`; KEEP
   `02.guide/12.json-schema-js.md` (we still emit the dialect) rewritten
   without `embedType` and without input framing; update `index.md` (the
   "three forms" copy), the about page, `docs/ARCHITECTURE.md`,
   `docs/ROADMAP.md`. `docs/done/` history stays as is.
7. **Follow-ups**: re-scope or close
   `docs/todos/propertynames-non-string-key-schema.md` (propertyNames stays,
   but the todo may be framed around the schema door); CHANGELOG entry
   marking the breaking removal (major bump per the release flow).

## Tests

- Full `pnpm test` + `go -C ts-go-runtypes test ./internal/...` green after
  each bucket lands (delete in the order above; keep commits separable).
- Grep gates: no `__rtOneOf` / `__rtNot` / `__rtUnevaluated` /
  `fromJsonSchema` / `embedType` references outside `docs/done/`.
- The phase-1 schema-emission suite still passes (proves the output
  direction survived the removal).
- Marker-rule coverage: unaffected suites already cover both
  `getRunTypeId` shapes; spot-check after deletion.

## Out of scope

- Removing `contains` / `patternProperties` / `propertyNames` or any format.
- Any new feature work; this is removal + doc realignment only.

## Done when

- All buckets above deleted; both test suites green; website builds; the
  emitted-schema feature (phase 1) unaffected; docs show two authoring forms
  plus schema OUTPUT only.

## Plan — full removal (approved 2026-08-17)

The blocker (`standard-json-schema-v1.md`) shipped: `internal/schemadoc` +
the `jsc` cache family + `createJsonSchemaFn` are the surviving OUTPUT stack,
and it imports only `internal/reflection` (never `internal/convert`), so the
convert-side deletion cannot break emission. Since none of the JSON Schema
input features were ever published, the removal ships without breaking-change
ceremony.

Investigation corrections to the body above:

- Real footprint is ~14,000–16,000 lines, not 9,500–11,000: the shared suite
  case tables (`test/suites/{validation,serialization,format-*,enrich}`)
  carry a per-case jsonSchema thunk arm (~500 field refs) consumed by the
  three `test/util/*Asserts.ts` drivers; the website playground has a third
  `jsonSchema` mode; `container/pre-publish-e2e` has a whole schema-input
  family; `json-schema-define/` is 4,749 lines not 1,698.
- `--portable` / CNV006 / `convertDialect` do NOT live on in the schema-emit
  leaf — runtime portability is implemented independently in JS
  (`standard/jsonSchemaDoc.ts`), so all three are deleted outright with the
  convert schema target.
- `canonical.go` has no "schema halves" — it only loses the three brand
  slots (`OneOf`, `Negations`, `Unevaluated`).
- The public `conditional()` / `dependentSchemas()` builders are built on
  `NotSlot` / `NotableFormat` and exist to mirror if/then/else — they are
  removed with the `not` brand (aggressive-removal decision, user approved).
- `SchemaParityProbe` (`internal/convert/schemadocparity*.go`) is phase 1's
  own fuzz deliverable; deleting the printer would orphan the renderer's
  shared-subset coverage. Its 33-declaration corpus is ported into
  `internal/schemadoc` as golden-document tests before the printer dies.
- `docs/todos/propertynames-non-string-key-schema.md` is fully obsoleted
  (every reproduction goes through `runTypeFromJsonSchema`; both surviving
  authoring surfaces reject a non-string key schema at compile time) — it
  moves to `docs/done/` with the obsolescence recorded. The native
  propertyNames feature stays.

Commit sequence (linear, separable):

1. JS input door: `src/json-schema/`, the `./json-schema` export, the
   `json-schema-dropped-intent` ESLint rule, playground overlay entry.
2. Input tests + harness: `json-schema-define/`, `test/types/jsonSchema*`,
   `test/fuzz/jsonschema/`, `test/json-schema-official/`, the playground
   test, the per-case jsonSchema thunk arms + driver plumbing, the
   converted-suites json-schema target, `gen-json-schema-suite.mjs`, fuzz
   registry + `RT_FUZZ_JSONSCHEMA_SOAK_MS`.
3. Go convert lane to two forms: `TargetJSONSchema`, `printschema.go`,
   `schemadocparity*.go` (corpus ported first), `--portable`/CNV006,
   `convertDialect`, embedType/runTypeFromJsonSchema import plumbing,
   convert test trims.
4. The three brands, JS + Go: oneOf (incl. OOF001 + defect machinery), not
   (incl. `conditional`/`dependentSchemas`), unevaluated; regen diag catalog
   + constants mirrors.
5. Benchmarks (`jsonSchemaCases`/`specCases`/spec harness + typecost lane +
   gen-docs), pre-publish-e2e family, playground third mode, website content
   (delete guide 11, trim 12/13/index/about + input framing), README,
   ARCHITECTURE, ROADMAP.
6. Move this spec + the propertyNames spec to `docs/done/`.
