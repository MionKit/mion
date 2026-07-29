# JSON Schema × RunTypes — Phase 2.1: schema as a FIRST-CLASS input (proven)

- **Status:** investigation complete — working prototype committed
- **Prototype:** `packages/ts-runtypes/test/features/jsonSchemaInput.proto.ts` (+ `.test.ts`)
- **Verdict: viable with ZERO Go-side changes.** All 10 prototype tests pass through the real
  pipeline (vitest + ts-runtypes-devtools + the Go resolver), including structural-id
  convergence with hand-written type-first types.

## 1. The approach (why it needs no new machinery)

The user-facing idea "build a type from the schema input, then let every `createXFn` work
off that type" is **exactly the existing value-first builder contract**:

1. `jsonSchema(s)` declares a trailing `id?: InjectRunTypeId<FromJsonSchema<S>>` marker.
2. `FromJsonSchema<S>` is a type-level translation of the `const`-inferred schema literal
   into the equivalent TS type **plus RunTypes format brands** (`{type: 'string', format:
   'email'}` → `TF.Email`; `{type: 'integer', minimum: 0, maximum: 130}` →
   `TF.Number<{integer: true; min: 0; max: 130}>`).
3. The Go scanner reflects whatever `T` the marker resolves to — it never needs to know
   JSON Schema exists. Structural typing does the rest: the schema-derived type converges
   on the **same structural id** as the equivalent hand-written type, so it hits the same
   cache entries, validators, encoders, mockers, enrichment, everything.

This is the same recovery trick as `InferType<typeof RT.object({...})>`, pointed at a
JSON Schema literal instead of builder calls. The runtime value of the schema is never
consulted by the build (the brand carries everything); `builderResult` returns the live
reflected node, so the result drops into every factory's schema-form overload.

## 2. What the prototype proves (all green)

| Claim | Evidence (test) |
| --- | --- |
| Schema literal → working compiled validator | `createValidateFn(jsonSchema({...}))` enforces shape + uuid/email formats + minLength/maxLength + integer min/max + nested required |
| **Convergence: schema input ≡ type-first type** | `.toBe(createValidateFn<ExpectedUser>())` — same cached factory object; `getRunTypeId(jsonSchema({...})) === getRunTypeId<ExpectedUser>()` |
| required/optional inversion (object-level `required` → per-prop `?`) | optional `email`/`city` absent ⇒ valid; missing required ⇒ invalid |
| Arrays, nested objects | `tags: {type: 'array', items}`, nested `address` with its own `required` |
| Formats generate REAL error metadata | `createGetValidationErrorsFn` reports `path: ['age']` with `format: {name: 'numberFormat', formatPath: ['max'], val: 130}` |
| Mock data straight from a JSON Schema | `createMockDataFn(jsonSchema({...}))` → 25/25 mocks pass the schema's own validator |
| `const`/`enum`/`anyOf`/nullable/`Record` | each converges with its type-first twin (`'admin' \| 'user' \| 3`, `string \| null`, `Record<string, number>`) |
| Module-scope schema consts | `const POINT_SCHEMA = {...} as const` passes the CompTimeArgs scanner cleanly (no CTA diagnostics) |
| No new diagnostics introduced | plugin output for the prototype files is clean |

Prototype keyword coverage: `type` (string/number/integer/boolean/null/object/array),
`properties`/`required`/`additionalProperties`(schema-record form), `items`, `const`,
`enum`, `anyOf`, `format` (email/uuid/date/time/date-time/hostname/ipv4/ipv6/uri),
`minLength`/`maxLength`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/
`multipleOf`, plus ignored annotations (`title`, `description`, `examples`, `$schema`,
`default`).

## 3. Findings & learnings

1. **tsgo resolves the inference cleanly.** The recursive conditional + key-remapped
   mapped types (`minimum` → `min`, required-membership split + `Flatten`) normalize to
   exactly the type-first shapes — proven by id equality, which is the strictest possible
   check (it hashes the whole normalized structure, format params included).
2. **Format params are the killer feature.** In plain-TS mappers (`json-schema-to-ts`)
   constraint keywords are *lost* (they don't exist in TS types). Here they land in
   format brands, which fold into the structural id and emit real validation code. A
   JSON Schema imported into RunTypes validates MORE faithfully than in any TS-first
   competitor: this is the "directly replacing AJV" angle, made concrete.
3. **CTA accepts `as const` module consts** — shared schema literals work with the
   documented `const` + literal-initializer rule; nothing new needed.
4. **Bug found (filed):** the format MOCK registry populates only via a side-effect
   import of `ts-runtypes/formats`; with the import elided (type-only usage), mocks of
   format-branded types silently violate their own validators. Repro'd 500/500, then
   fixed in the prototype with the same bare side-effect import
   `composeBuilders.test.ts` already uses. Spec:
   `docs/todos/mock-format-registry-side-effect-import.md`. A productized
   `jsonSchema()` entry point should import the mock registrations itself (option 1 in
   the spec) so schema users never meet the footgun.
5. **`enum`/`const` conversion is exact** for string/number/boolean/null members — the
   same value-union the `enumType` builder produces (nominal TS-enum identity is out of
   scope by design, as documented there).

## 4. Productization design

### Surface

- New subpath **`ts-runtypes/json-schema`** (NOT `/schema` — that name is the value-first
  builder surface). Exports:
  - `jsonSchema(schema)` — the builder (name open: `fromJsonSchema` / `RT.jsonSchema`).
  - `FromJsonSchema<S>` — the standalone inference type (the `JSONSchema.infer` ask;
    also useful without the builder).
  - `JsonSchemaInput` — the accepted draft 2020-12 subset, versioned & documented.
- Works everywhere a value-first schema works today (all factory schema-form overloads,
  `getRunType(Id)`, enrichment via the reflected type) — no per-factory work.

### Keyword roadmap beyond the prototype (per the Phase 1 map)

| Tier | Keywords | Notes |
| --- | --- | --- |
| T1 (mechanical) | `prefixItems` (+`items` rest / `false`), `type: [...]` array form, `allOf`, `patternProperties`→`Record`, `propertyNames` formats, `properties`+`additionalProperties` intersection | all have exact type-level encodings already proven by the builder surface |
| T2 (policy needed) | `pattern` (mockSamples policy — quirk §5.11 of the mapping doc), `oneOf` (accept as union + diagnostic), `additionalProperties: false` (closedness pairing guidance), unknown `format` values (annotation-only per spec, but surface an Info) | |
| T3 (deferred) | `$defs`/`$ref` non-recursive lookup; recursive `$ref` (type-level cost — steer to `circular()`); `if/then/else`, `not`, `unevaluatedProperties`, `dependent*`, `contains`, `uniqueItems`, `min/maxItems`, `min/maxProperties` (no type/format counterpart today — see the gaps list) | |

### Enforcement of the subset (important design point)

Unknown/unsupported keywords must not silently weaken validation. Two complementary
mechanisms, both already idiomatic in the repo:

1. **Type-level**: constrain the schema param with the `ExactParams` pattern (as every
   format builder does) so an unsupported keyword is a red squiggle at the call site —
   zero Go work, instant DX.
2. **Build-time**: the scanner already reads `CompTimeArgs` literals; a small Go-side
   check of the schema literal at `jsonSchema` sites can emit proper catalog diagnostics
   (new `JSI0xx` family) for keywords accepted-but-degraded (`oneOf`, dropped
   constraints), following the Warning/Error severity discipline. Optional, second step.

### Costs & risks

- **Type-check cost**: the inference is `extends`-guard + homomorphic maps with two
  recursive spots (`FromAnyOf`, nested properties). Must land with an
  instantiation-budget test like `dataonly.compile.test.ts` (the repo's established
  guardrail) before shipping; wide schemas are the risk case, same as wide unions in the
  builder surface.
- **Drift risk vs the Go format registry**: the `format:` → brand table must be derived
  from `typeFormats.generated.ts` (`FormatName`) rather than hand-listed, so a new Go
  format automatically surfaces.
- **Draft dialect creep**: the input type pins the accepted subset; `$schema` values
  other than 2020-12 should raise the type-level error (draft-07 input can be a later
  compat layer — most draft-07 schemas in the wild are also valid 2020-12 for the
  supported subset).

## 5. Recommendation

Ship this. It is the highest-value half (AJV replacement + auto-typing any JSON Schema),
it is provably compatible with the whole existing pipeline, and its cost is almost
entirely type-level TypeScript with established guardrails. Sequencing in
[04-migration-plan.md](04-migration-plan.md).
