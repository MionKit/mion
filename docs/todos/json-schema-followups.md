---
type: chore
spec: full-plan
status: ready
created: 2026-08-07
---

# JSON Schema follow-ups: if/then/else literal widening, and the Type Builders rename

Two independent, PR-sized items left after the JSON Schema input feature
closed. Consolidated 2026-08-07 from the standalone specs
`json-schema-ifthenelse-const-brands-hide-literals.md` and
`rename-value-first-schema-to-type-builders.md`; each section keeps its
original spec depth and ships as its own PR.

## Item 1 — if/then/else over const arms brands the literals, so the clean type widens them away (fix, guidelines, 2026-08-07)


Found by the clean-type audit
([06-clean-type-audit.md](../investigations/json-schema/06-clean-type-audit.md),
residual 1). Not a soundness bug — a documentation-quality limit with an
id-affecting fix, which is why it is filed instead of shipped with the audit.

### What happens

`{if: {maxLength: 4}, then: {const: "yes"}, else: {const: "other"}}` lowers
its branches as `(IfBrand & "yes") | (NotSlot<String<…>> & "other")` — the
condition rides each literal as an intersection brand. The reflected type
needs that (the validator reads the condition from the brand), but TypeScript
has no intersection subtraction, so StripRunTypeMeta cannot recover the bare
literal and widens the arm to `string`. The ideal clean type `"yes" | "other"`
is lost; the shipped one is `string`.

### The fix this needs (a decision, then a lowering change)

Move the if-condition off the literal arms — e.g. carry it once on the union
carrier (the `__rtOneOf`-style slot) instead of intersecting each branch. Then
the branches stay plain literals, the strip keeps them, and the clean type is
`"yes" | "other"`.

This changes FromJsonSchema's encoding for the if/then/else lowering, which
moves the structural id of every affected schema — a cache-invalidating,
id-affecting change that needs its own review of the emitter's reading of the
slot, id-convergence tests for all three authoring modes, and a mode-parity
check. Scope is small but the blast surface is the id fold, hence its own PR.

### Done when

- The lowering carries the if-condition without branding the literal arms.
- `JsonSchemaType` of the example above is `"yes" | "other"` (pin it in the
  type-gate or the compile suite).
- Go + JS id-convergence and the official suite stay green; the audit doc's
  residual 1 is updated to point here as fixed.
## Item 2 — Rename the value-first surface from "schema" to Type Builders (chore, full-plan, 2026-08-02, refreshed 2026-08-07)


Investigated 2026-08-02 (full sweep of content/, playground, exports, tests,
benchmarks, e2e, Go internals); references refreshed 2026-08-07 after the
JSON Schema finish work merged. One PR, unblocked now.

### Problem

"Schema" does four jobs, and they collide on the home page alone: the tagline
"No schemas, no drift" ([index.md](../../container/website/content/index.md)
frontmatter + the SEO copy in
[app.config.ts](../../container/website/app/app.config.ts)), the `RT.*`
"schema builders" (our feature), "Speaks Standard Schema" (external spec), and
"Bring the JSON Schemas you already have" (external standard). The two
external names are fixed and the tagline is the brand, so the only sense we
own is the feature — the one contradicting all three. Since JSON Schema
shipped it stopped being cosmetic:
[06.validation.md](../../container/website/content/2.guide/06.validation.md)
enumerates the call forms as "type-first, value-first, schema-first, JSON
Schema" (two unrelated schemas in one list), and the playground selector
(the JSON Schema mode shipped with
[json-schema-finish-line.md](../done/json-schema-finish-line.md) Phase 6)
now reads Type | Schema | JSON Schema — two unrelated schemas side by side
in the UI.

Precedent and timing: TypeBox officially calls the equivalent surface its
Type Builder (the home page already sells "the Zod / TypeBox feel"), the
internal vocabulary is half-migrated already (suite `value-first-define`, Go
package `compiler/builders`, ROADMAP "value-first builders"), and at v0.11.0
an exports alias makes the npm rename non-breaking — after 1.0 it never is
again.

### Vocabulary (decided)

- Feature name: **Type Builders**. Tab / toggle label: **Builder**.
- The functions (`RT.object()`, `TF.email()`): **builders**.
- The value a builder returns: a **run-type** (it IS `RunType<T>`; picked over
  zod-style "builder" for the value on 2026-08-02 to keep function vs value
  distinct). Prose shape: "a builder returns a run-type;
  `InferType<typeof rt>` recovers the type".
- Call forms: type-first / value-first / **run-type** / JSON Schema.
- Subpath: `@ts-runtypes/core/builders` canonical; `./schema` stays as a
  deprecated alias to the SAME dist files until 1.0.
- Guide page: `01.types-vs-schemas.md` → `01.type-builders.md`, title
  "Type Builders" (feature-centric; the prose does the comparison).
- Explicitly UNCHANGED: the tagline, the "your types are the schema" rhetoric
  ([README.md](../../README.md), about, built-on-typescript-go), everything
  Standard Schema and JSON Schema, `RunType` / `InferType` / `RT` / `TF`.

### Plan

**Tier 1 — docs + site (no API change).**

- Rename the guide page + title/description; retarget the nav redirect
  ([2.guide/.navigation.yml](../../container/website/content/2.guide/.navigation.yml));
  add the old URL to
  [container/website/public/_redirects](../../container/website/public/_redirects).
- Prose passes (builder-sense only; every JSON-Schema-sense use stays):
  [index.md](../../container/website/content/index.md) ("RT.* schema
  builders", "no separate schema to keep in sync"),
  [1.about-ts-runtypes.md](../../container/website/content/1.introduction/1.about-ts-runtypes.md),
  [06.validation.md](../../container/website/content/2.guide/06.validation.md)
  (call-form bullets + "four call forms" line),
  [03.type-formats.md](../../container/website/content/2.guide/03.type-formats.md)
  ("Schema-first, …" ×3 + description), and the two builder-sense sentences in
  [02.json-schema.md](../../container/website/content/2.guide/02.json-schema.md)
  ("ordinary schema value" → run-type; the migration-table intro naming the
  subpath).
- The five `[Schema]` code-group tab labels → `[Builder]` — AND the icon map in
  [app.config.ts](../../container/website/app/app.config.ts) whose KEY is the
  lowercased tab label (`schema:` → `builder:`), easy to miss.
- Example file renames (update `<code-import>` paths + `const schema` locals):
  `_homepage/define-schema.ts` → `define-builder.ts`, `_homepage/formats-schema.ts`
  → `formats-builder.ts`, `guide/types-vs-schemas-{side-by-side,static,mixed}.ts`
  → `type-builders-*`, `guide/type-formats-schema-first.ts` →
  `type-formats-builder.ts`; plus the
  [packages/examples/tsconfig.json](../../packages/examples/tsconfig.json)
  paths key.
- Playground: toggle label/tooltip/hint in
  [PlaygroundStage.client.vue](../../container/website/app/components/playground/PlaygroundStage.client.vue),
  `'schema'` → `'builder'` inside `Mode = 'type' | 'schema' | 'jsonSchema'`
  in [engine.ts](../../container/website/app/playground/engine.ts) (the
  jsonSchema arm stays), the per-preset
  `schema:` field + imports in
  [presets.ts](../../container/website/app/playground/presets.ts). Mode is
  ephemeral component state (verified: no localStorage / query persistence),
  so no legacy-value handling.
- Website style rules apply: prose-only pass constraints, and per-file
  MDC-component + code-fence counts must match the pre-edit baseline.

**Tier 2 — public API (semver-safe via alias).**

- `packages/ts-runtypes/src/schema/` → `src/builders/` (index / atomic /
  compose / static / utility). Exports map in
  [package.json](../../packages/ts-runtypes/package.json): add `./builders` as
  canonical, keep `./schema` pointing at the same `dist/builders/*` files as a
  deprecated alias until 1.0 (zero duplication; one module, so structural ids
  and caches are unaffected).
- JSDoc + parameter names (IDE-visible, non-breaking): the
  "SCHEMA (value-first)" overload docs → RUN-TYPE, `schema:` params →
  `runType:` in
  [createRTFunctions.ts](../../packages/ts-runtypes/src/createRTFunctions.ts),
  [createRTFBinary.ts](../../packages/ts-runtypes/src/createRTFBinary.ts),
  [markers.ts](../../packages/ts-runtypes/src/markers.ts),
  [getRunType.ts](../../packages/ts-runtypes/src/getRunType.ts).
- Migrate the ~40 `@ts-runtypes/core/schema` import sites: packages/examples
  (11 files), the ts-runtypes test tree (whole `value-first-define` suite,
  playground tests, `types/staticEquivalence`, `id-integrity/distinctness`,
  `serialization/Arrays`, …), the e2e apps
  ([container/pre-publish-e2e/apps/shared/src/](../../container/pre-publish-e2e/apps/shared/src/)
  `types-vs-schemas.ts` → `type-builders.ts` + `json-schema.ts` + `formats.ts`
  + `index.ts`), benchmarks
  ([typecost/typecost.mjs](../../container/benchmarks/typecost/typecost.mjs)
  path map, `typecost/tsconfig.json` paths key,
  `competitors/ts-runtypes/schemaCases.ts`), playground presets.
- Devtools prefilter:
  [prefilter.test.ts](../../packages/ts-runtypes-devtools/test/eslint/prefilter.test.ts)
  pins the `/schema` specifier — `referencesMarkerModule` must match BOTH
  specifiers during the alias window; pin both.
- Playground vendored dist (`app/playground/.vendor/ts-runtypes-dist`, aliased
  in nuxt.config.ts): regenerate after dist gains `builders/`; locate the sync
  mechanism during implementation.
- Doc refs: the `/schema` subpath mentions in
  [docs/ARCHITECTURE.md](../ARCHITECTURE.md) (~line 295) and
  [docs/ROADMAP.md](../ROADMAP.md) (the two shipped-feature bullets), plus a
  ROADMAP note that the `./schema` alias is removed at 1.0.

**Tier 3 — internal identifiers (same PR, mechanical).**

- Go: `IsSchemaLeafCall` → builder naming
  ([builders.go:34-41](../../ts-go-runtypes/internal/compiler/builders/builders.go)
  + both scan.go call sites), the schema-overload comments in
  [scan.go](../../ts-go-runtypes/internal/compiler/resolver/scan.go), and
  `schema_optional_reflect_test.go`. Verified: no wire names and no
  user-visible diagnostic text carry the builder sense (protocol.go /
  refslots.go hits are all JSON Schema).
- JS: `isRunTypeSchema` in
  [rtUtils.ts](../../packages/ts-runtypes/src/runtypes/rtUtils.ts),
  `test/playground/getRunTypeSchemaConvergence.test.ts`, the `SCHEMA_FORM`
  consts in playground tests.

### Tests

Pure rename, no new behavior — the existing gates are the net: full
`pnpm test` (the moved suite compiles against the new subpath), the root
typecheck compiles every example via the dist paths, the Go suite, and the
release e2e apps compile against the published surface. Keep ONE e2e import on
`./schema` deliberately — that pins the alias until 1.0. Update the prefilter
test to pin both specifiers. No new marker tests (no new API); the existing
paired `getRunTypeId` shapes ride the moved suite.

### Docs

Tier 1 IS the docs work. After the style-touched pages: verify no em/en
dashes introduced and MDC/fence counts match baseline
(per CLAUDE.md website rules).

### Out of scope

- Removing the `./schema` alias (1.0, tracked by the ROADMAP note).
- Renaming the `value-first-define` suite directory (already correct) and
  rewriting historical `docs/done/` records (never rewritten).
- The tagline, rhetoric, Standard Schema / JSON Schema wording (see
  Vocabulary).

### Done when

- Site + playground show Type Builders / Builder everywhere the builder sense
  appeared: a grep for "schema" over `container/website/content/` +
  `container/website/app/` (excluding `.vendor`) returns only JSON Schema,
  Standard Schema, `$schema`, and the deliberate rhetorical uses.
- `@ts-runtypes/core/builders` is canonical, `./schema` resolves to the same
  module (one pinned e2e import proves it), every repo import site migrated.
- The old guide URL redirects; ARCHITECTURE / ROADMAP updated.
- Full gates green: `pnpm test`, `go -C ts-go-runtypes test ./internal/...`,
  lint, format, MDC/fence baseline parity on touched pages.
