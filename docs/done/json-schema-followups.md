---
type: chore
spec: full-plan
status: done
created: 2026-08-07
completed: 2026-08-07
---

# JSON Schema follow-ups: if/then/else literal widening, and the Type Builders rename

Two independent items left after the JSON Schema input feature closed.
Consolidated 2026-08-07 from the standalone specs
`json-schema-ifthenelse-const-brands-hide-literals.md` and
`rename-value-first-schema-to-type-builders.md`.

**Shipped together in ONE PR** (the original text called for one PR each; that
split was dropped on request), in two commits: the clean-type fix, then the
rename.

## Item 1 — if/then/else over const arms brands the literals, so the clean type widens them away

**SHIPPED**, but NOT the way this spec predicted. The section below records what
was actually built; the original prescription is preserved after it, with the
reason it was wrong, because the reasoning is the useful part.

### What happened

`{if: {maxLength: 4}, then: {const: "yes"}, else: {const: "other"}}` lowers as
`(If ∧ Then) ∨ (¬If ∧ Else)`, so the condition rides each arm as an intersection
brand: the then-arm carries the ordinary `TypeFormat` brand from `StringFrom`,
the else-arm a `NotSlot`. Both arms are therefore BRANDED STRING LITERALS, and
`StripRunTypeMeta` widened any literal carrying a sentinel key to its base. The
ideal clean type `"yes" | "other"` came out as `string`.

There is no `IfBrand` type and never was — the spec's shorthand for it was the
ordinary format brand.

### What actually fixed it

**`StripRunTypeMeta` only. Zero lowering change, zero Go change, zero id
movement.**

The audit's claim that "TypeScript has no intersection subtraction" is true of
every type OPERATOR, and re-verified against the repo's pinned TS 6.0.3: template
construction, template inference, mapped-key normalisation, `Extract`,
`T & string`, `Exclude` and the string intrinsics all fail to reduce over an
intersection. But subtraction does exist — **in inference**. When an inference
target is an intersection, the checker matches its constituents pairwise against
the source's under type IDENTITY, deletes the matched pairs from both sides, and
infers the remainder into a naked `infer U` (`inferFromMatchingTypes`; tsgo
ports it verbatim in `internal/checker/inference.go`, so both compilers agree).
So `T extends infer U & Brand ? U : never` hands back the bare literal.

`StripMetaUnbrandLit` in
[stripRunTypeMeta.ts](../../packages/ts-runtypes/src/runtypes/stripRunTypeMeta.ts)
does exactly that, with one residual part per carrier group (identity matching
means a single merged residual object is identical to none of the encodings and
silently subtracts nothing). The three widen fallbacks for string / number /
bigint route through it.

Two properties make it safe:

- **Graceful degradation.** An unmatched constituent leaves `U` as `T`, the
  existing sentinel re-check fires, and the arm widens exactly as before. The
  worst case is the old behaviour, never a wrong answer.
- **Nothing else moves.** `FromJsonSchema`'s output for the defect schema is
  byte-identical, so no structural id shifted. `IteFrom` and `ConditionalOf`
  were not touched, and the door↔builder lockstep constraint never activated.

Measured, against the real source tree: the defect schema's `JsonSchemaType`
went `string` → `"yes" | "other"`, its numeric twin `number` → `1 | 2`, and a
`oneOf` over literal arms `string | number` → `1 | "a"` as a bonus. The official
type gate stayed at **0 divergences over 1030 spec-valid samples**, ledger still
empty.

### Why the spec's own prescription would not have worked

The original text said to "carry the condition once on the union carrier (the
`__rtOneOf`-style slot) instead of intersecting each branch", and called the
result "a cache-invalidating, id-affecting change" needing id-convergence tests
across three authoring modes and a mode-parity check.

`__rtOneOf` is **not** a union-level carrier.
[static.ts](../../packages/ts-runtypes/src/builders/static.ts) intersects it onto
every non-nullish arm (`Arm & {readonly [__rtOneOf]?: All}`), and
[typeid/formats.go](../../ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go)
records why a whole-union sentinel is impossible: an intersection over a union
distributes and destroys null branches. A slot of that shape lands right back on
the string literal and widens identically. Going that route for real would have
meant a new named wire contract in `sentinelKeys.ts`, a new Go reader, a new
`protocol.RunType` field plus refslots reachability, a typeid fold, validate and
validation-errors emit, `noop_types` disqualification, serialize, module packing
and mock/dataOnly handling — and it would have moved every affected id. None of
that was necessary.

### Done when — all met

- ✅ The clean type keeps the literal arms. (The lowering was left alone; the
  spec asked for "the lowering carries the if-condition without branding the
  literal arms", and the annotation-side fix reaches the same outcome without
  touching the encoding.)
- ✅ `JsonSchemaType` of the example is `"yes" | "other"`, pinned in
  [jsonSchemaRecovered.typecheck.ts](../../packages/ts-runtypes/test/types/jsonSchemaRecovered.typecheck.ts)
  against the real door (with a `@ts-expect-error` negative row that would stop
  erroring the moment the arms widened again) and in
  [stripmeta.compile.test.ts](../../packages/ts-runtypes/test/types/stripmeta.compile.test.ts).
- ✅ Go + JS id convergence and the official suite stayed green, untouched.
- ✅ The audit doc's residual 1 now points here as fixed.

### Called out for review

The stripmeta residual-policy budget rose **1006 → 1190**, and the new
subtraction test opens at **2152**. The one-way ratchet protocol allows an
increase for "a deliberate new capability in the mapping" if it is called out
explicitly — this is that call-out. The file's other seven budgets are
unchanged: the new branch costs nothing unless a branded literal is met.

### Split out, not shipped

The same mechanism also recovers the audit's SECOND residual (branded tuples
keeping verbatim; verified it subtracts). It needs the four structural sentinels
modelled and lands in `StripMetaArray`, a different branch with its own budget,
so it became [strip-branded-tuple-residual.md](../todos/strip-branded-tuple-residual.md).

## Item 2 — Rename the value-first surface from "schema" to Type Builders

**SHIPPED as specified.** The vocabulary, the tiers and the out-of-scope list
all held; the corrections below are scope, not direction.

### Problem

"Schema" did four jobs and they collided on the home page alone: the tagline
"No schemas, no drift", the `RT.*` builders (our feature), "Speaks Standard
Schema" (external spec), and "Bring the JSON Schemas you already have" (external
standard). The two external names are fixed and the tagline is the brand, so the
only sense we own is the feature — the one contradicting all three. Since JSON
Schema shipped it stopped being cosmetic: the validation guide enumerated the
call forms as "type-first, value-first, schema-first, JSON Schema" (two
unrelated schemas in one list) and the playground selector read
Type | Schema | JSON Schema.

### Vocabulary (as shipped)

- Feature name: **Type Builders**. Tab / toggle label: **Builder**.
- The functions (`RT.object()`, `TF.email()`): **builders**.
- The value a builder returns: a **run-type**.
- Call forms: type-first / value-first / **run-type** / JSON Schema.
- Subpath: `@ts-runtypes/core/builders` canonical; `./schema` a deprecated alias
  to the SAME dist files until 1.0.
- Guide page: `01.types-vs-schemas.md` → `01.type-builders.md`, title
  "Type Builders".
- UNCHANGED, as planned: the tagline, the "your types are the schema" rhetoric,
  everything Standard Schema and JSON Schema, `RunType` / `InferType` / `RT` /
  `TF`.

### Corrections to this spec, found while implementing

1. **The import-site count was ~2x low.** The spec said "~40
   `@ts-runtypes/core/schema` import sites"; the real figure was **86
   occurrences across 83 files**. Two were invisible to the obvious grep:
   `container/benchmarks/typecost/tsconfig.json` (its VALUE contains
   `node_modules/`, so `grep -v node_modules` drops the line) and
   `scripts/website/playground-overlay.mjs` (under `scripts/`, not
   `container/`). Markdown was a third blind spot — the code-file sweep missed
   two prose references in the JSON Schema guide.
2. **`./schema` cannot alias `dist/schema/*`.** The build is plain `tsc --build`
   mirroring `src/` → `dist/` with no bundler and no entry list, so renaming the
   directory REMOVES `dist/schema/`. The deprecated alias is a second `exports`
   key pointing at `./dist/builders/index.*`.
3. **The devtools prefilter needed no source change.** `MARKER_MODULE` is an
   unanchored prefix match on `@ts-runtypes/core`, so `/builders` already
   passed. Only the test assertion named `/schema`; it now pins both.
4. **Two Go identifiers the spec missed**: `schemaInternalAliasNames` and
   `isSchemaInternalAlias` in `cachegen/runtype/dataonly.go` (plus their
   `serialize.go` caller). Both renamed. The spec's verification that no wire
   name and no user-visible diagnostic text carries the builder sense held.
5. **`json-schema.ts` and `formats.ts` do NOT reference `./types-vs-schemas`**
   in the e2e shared app — only `index.ts` does.
6. **A pre-existing contradiction, fixed in passing.** The validation guide
   called the `RT.*` form "Schema-first" while the type-formats table called it
   "Value-first", and `json-schema-convergence.ts` used `schemaFirst` for the
   JSON Schema form — the same token with opposite senses on pages that link to
   each other. The new vocabulary resolves all three.
7. **The typecost benchmark column label** read "ts-runtypes (schema)" on a
   public benchmarks page. The LABEL moved to "ts-runtypes (builder)"; the
   internal `id` (`ts-runtypes-schema`) was deliberately left alone since stored
   bench data is keyed by it.

### Tests

Pure rename, no new behaviour, so the existing gates were the net — and they
caught a real miss (`presets.test.ts` still reading `preset.schema`). One e2e
import stays on `./schema` deliberately, which is what pins the alias until 1.0;
the prefilter test pins both specifiers.

### Out of scope (unchanged)

- Removing the `./schema` alias (1.0, tracked by the ROADMAP note).
- Renaming the `value-first-define` suite directory and rewriting historical
  `docs/done/` records.
- The tagline, rhetoric, Standard Schema / JSON Schema wording.

### Done when — all met

- ✅ Site + playground read Type Builders / Builder everywhere the builder sense
  appeared; a grep over `container/website/content/` + `container/website/app/`
  returns only JSON Schema, Standard Schema, `$schema` and the deliberate
  rhetorical uses.
- ✅ `@ts-runtypes/core/builders` is canonical, `./schema` resolves to the same
  module, every repo import site migrated.
- ✅ The old guide URL redirects; ARCHITECTURE and ROADMAP updated, including
  the note that the alias goes at 1.0.
- ✅ Full gates green: `pnpm test` (11,092 passed), `go -C ts-go-runtypes test
  ./internal/...`, `go vet`, lint, typecheck, format, codegen `--check`, the
  fuzz lane, the official conformance lane (359 passed, empty divergence
  ledger), and MDC / code-fence baseline parity on the renamed guide page.
