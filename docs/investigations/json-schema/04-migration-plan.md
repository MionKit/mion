# JSON Schema × RunTypes — the plan

- **Status:** proposed (investigation complete; both directions prototyped green)
- **Inputs:** [01-phase1-mapping.md](01-phase1-mapping.md) (facts),
  [02-phase2-first-class-input.md](02-phase2-first-class-input.md) (input, proven),
  [03-phase2-derived-output.md](03-phase2-derived-output.md) (output, proven)
- **Prototypes:** `packages/ts-runtypes/test/features/jsonSchema{Input,Output}.proto{,.test}.ts` — 27 tests green through the real pipeline

## 0. Recommendation in one paragraph

Ship **both** directions, input first. The first-class input (`jsonSchema(schema)` +
`FromJsonSchema<S>`) is proven to need **zero Go changes**, lands as one new subpath, and is
the headline feature (auto-typing any JSON Schema + compiled validators/mocks/encoders —
the direct AJV replacement). The derived output (`createJsonSchemaFn<T>()`) becomes a
standard Go emitter family so unsupported kinds surface as real build diagnostics (the
Warning/Error discipline is the point of the feature); the prototype walker stays as the
parity oracle. Dialect: **2020-12 only** at first; draft-07 is a later downlevel option.

## 1. Resolved decisions (proposed defaults)

| Decision | Default | Rationale |
| --- | --- | --- |
| Dialect | 2020-12, `$schema` stamped | mapping doc §1 (tuples, unevaluatedProperties, uuid/duration, OpenAPI 3.1) |
| OUT projection | **wire** (what the JSON family emits/accepts) | that is what a JSON Schema consumer validates; identical to the value domain for plain DTOs |
| Map/Set OUT | build **Error**; `mapSet: 'wire'` opt-in | user's DataOnly instinct; the wire form is a RunTypes convention outsiders would not guess |
| Non-data kinds OUT | drop at property (**Warning**), **Error** at root/propagating | mirrors DataOnly/validate exactly; proven in prototype |
| Objects OUT | open (no `additionalProperties`); `closed: true` option emits `false`/`unevaluatedProperties` | matches `createValidateFn`; closedness pairs with `hasUnknownKeys` |
| Unions OUT | always `anyOf`, never `oneOf` | TS cannot promise exclusivity; `oneOf` could reject values our validator accepts |
| `oneOf` IN | accept as union + diagnostic | exclusivity weakens; visible, never silent |
| Unknown keywords IN | type-level rejection (`ExactParams` pattern) for unknown; diagnostics for known-but-degraded | red squiggle beats silent weakening; zero Go work for the common case |
| `format` IN unknown values | plain string + Info diagnostic | 2020-12 annotation-by-default semantics, made visible |
| Pattern IN without samples | accept for validation; mock for that type throws a targeted error until samples are registered (sidecar option later) | keeps validation value without breaking mock soundness rules |
| Format twins OUT | emit hard `pattern` next to `format` when cheap (uuid version, flagless built-ins) | consumers without format-assertion still validate |
| Flagged patterns OUT | omit keyword + Warning (`u`-only passes through) | omission loosens; a wrong-dialect pattern lies |

## 2. Milestone A — first-class input (`ts-runtypes/json-schema` subpath)

JS-only. Productize the Phase-2.1 prototype.

1. New subpath `packages/ts-runtypes/src/json-schema/` (NOT `/schema` — taken):
   `jsonSchema()` builder, `FromJsonSchema<S>`, `JsonSchemaInput` (versioned 2020-12
   subset), keyword tiers T1 from the mapping doc (`prefixItems`+rest, `type: [...]`,
   `allOf`, `patternProperties`→`Record`, `properties`+`additionalProperties`
   intersection), `ExactParams`-style excess-keyword rejection.
2. Derive the `format:` → brand table from `typeFormats.generated.ts` (`FormatName`) so new
   Go formats can't drift silently.
3. Fix `docs/todos/mock-format-registry-side-effect-import.md` (option 1: the mock subtree
   imports its own format-mock registrations) — schema users are the first who will hit it
   from a types-only import graph.
4. Tests (PR-readiness gate): port the prototype suite to the real subpath; add the
   remaining keyword tiers; **type-level instantiation-budget test** following
   `test/types/dataonly.compile.test.ts` (wide-schema worst cases); both `getRunTypeId`
   call shapes (already in the prototype); fuzz: a schema-literal generator feeding the
   existing type-fuzz value oracles (valid/invalid values against `createValidateFn(jsonSchema(gen))`).
5. Docs: website page under the schemas section ("Use a JSON Schema", reader-first, no
   internals), `docs/ARCHITECTURE.md` factory list mention, `docs/ROADMAP.md` scope note,
   examples in `packages/examples/src/` consumed via `<code-import>`.
6. Optional second step: Go-side `JSI0xx` diagnostics for accepted-but-degraded keywords
   read off the `CompTimeArgs` literal at `jsonSchema` sites (the scanner already reads
   literals; pure add).

Deferred from A: `$defs`/`$ref` (non-recursive lookup first, recursion → `circular()`),
draft-07 input compat, `if/then/else`/`not`/`dependent*` (no type counterpart — diagnose).

## 3. Milestone B — derived output (Go emitter family)

The standard new-family checklist (verified against the current registries):

**Go (9 touchpoints)**
1. `internal/constants/constants.go` — `CacheModules["jsonSchema"]` row (`VarPrefix
   "g_jsc_"`, tag `jsc`).
2. `internal/cachegen/operations/operations.go` — operation row (`FnKey: "jsonSchema"`,
   new options axis for `mapSet`/`closed`/`vendorExtensions`/`target` variants).
3. `internal/cachegen/typefunctions/json_schema.go` — the emitter: one `Emitter` struct +
   one `switch rt.Kind` implementing the Phase-1 table; emits each entry as a constant
   (`Args()` empty, body `return <schema literal>`); reuses the template-literal regex
   builder; `$defs` from the ref table.
4. `families.go` — one `family("jsonSchema", JsonSchemaEmitter{})` row.
5. `diag_codes.go` — `jsonSchemaCodes` slot map + root-code map.
6. `internal/diagnostics/codes_runtype.go` (+`messages.go`, `prose.go`) — `JSC001…` root
   Errors (map/set/non-serializable/symbol/function root, undefined root), `JSC010+`
   property Warnings (dropped prop, dropped bounds, flagged pattern, non-ISO layout,
   union-member drop, enum-name loss) with executable Examples.
7. `internal/protocol/protocol.go` — `AddedJsonSchema` response flag + accessor row.
8. `internal/compiler/resolver/dispatch.go` — `familyAddedFlags` row.
9. `alwaysthrow_message.go` — root-code mapping.

**Codegen regen:** `pnpm rtx core codegen fnhashes` / `kind --check` untouched /
`gen:diag-catalog` / `gen-ts-constants` (CI enforces sync).

**JS**
- `createJsonSchemaFn` in `createRTFunctions.ts` (+ fnKey in `RTFunctionByKey`, exports,
  devtools lint passthrough for the new codes).
- Parity test: the prototype walker (promoted to a test oracle) must deep-equal the
  Go-emitted constants across the F1–F17-style fixture corpus — the EditBuffer-twin
  pattern.
- Fuzz: extend the type fuzzer with a schema-emission lane (emitted document parses, is
  structurally valid 2020-12, `$ref`s resolve).

**Container (conformance)**
- Benchmarks image: an AJV 2020 lane — for each corpus type, compile the emitted schema
  with `ajv/dist/2020` + `ajv-formats`; `createMockDataFn` values must pass; `{invalid:
  true}` mocks must fail (both-directions agreement). This is the external-truth gate and
  lives container-side by dependency policy.

## 4. Milestone C — extensions (each independent, post-B)

draft-07 `target` downlevel (mapping §5.14 deltas) · vendor extensions
(`formatMinimum`/`formatMaximum`, `x-enumNames`, `discriminator` under an `openapi` flag)
· non-ISO layout → derived `pattern` tables · array/object constraint format families
(`minItems`/`uniqueItems`/`minProperties` — closes the biggest IN-direction gaps, mapping
§5.12) · string `duration` format family · `$defs` IN support · Standard Schema
co-exposure of the derived document.

## 5. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Type-level inference cost on wide schemas (IN) | budget test gate (dataonly-harness pattern) before ship; fixed-arity fast paths if needed (the union-builder precedent) |
| Schema consumers under-validate `format` | emitted pattern twins + loud docs (assertion vocabulary / ajv-formats) |
| Drift between format registry and IN table | derive from `typeFormats.generated.ts`; CI sync checks |
| Checker-normalized types surprise users (`'a' \| string` → `string`) | website docs state the "schema of what the type means" contract explicitly |
| Emitted-schema regressions | Go⇄JS parity oracle + AJV container lane + fuzz emission lane |
| Draft-07 consumers | explicit later `target` option; do not fork the default |

## 6. Sequencing & effort (relative)

A is mostly type-level TS + docs + tests (small-medium; no Go). B is a standard family
(medium; the emitter switch is mechanical off the Phase-1 table — the table IS the spec).
C is a menu of small independents. A before B maximizes early value (AJV replacement) and
de-risks B (A's users generate the demand corpus B's conformance lane needs).

## 7. What exists today (this branch)

- `docs/investigations/json-schema/01…04` (this set).
- Working prototypes + 27 green tests: `packages/ts-runtypes/test/features/jsonSchema*`.
- Bug filed from the investigation: `docs/todos/mock-format-registry-side-effect-import.md`.
