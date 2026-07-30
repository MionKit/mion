---
type: feature
spec: full-plan
status: done
created: 2026-07-29
---

# JSON Schema as a first-class input — incremental implementation + full suite coverage

**Status:** done — all milestones M0–M7 shipped in order, one commit per milestone, each landing green (see "Shipped" at the bottom).

**Process-level plan.** This spec fixes the order, the test-coverage matrix, the conventions, and the done-criteria. Code-level design (type-level implementation details, exact flag/file names, emit shapes) is the implementing agent's job. Foundation: [docs/investigations/json-schema/](../investigations/json-schema/) (01–04) + the proven prototypes `packages/ts-runtypes/test/features/jsonSchemaInput.proto{,.test}.ts` (10 green tests incl. structural-id convergence, zero Go-side changes needed).

## Intent

Accept draft 2020-12 JSON Schema literals as a first-class authoring form: `jsonSchema({...})` → `RunType<FromJsonSchema<S>>`, usable in every factory exactly like the value-first builders, converging on the same structural id as the equivalent hand-written type. Scope of this todo: **implementation + testing only** — docs / website / benchmarks / e2e are a separate later phase, planned after this ships.

## Ground rules (fixed)

1. **Incremental layers, in this order:** atomics → arrays/tuples → objects/records → unions/combinators → utility types → circular/$defs. Each layer lands fully tested before the next starts; whatever is merged is known-working.
2. **JSON Schema is a THIRD AUTHORING FORM** across the suites, exactly as value-first is the second: new sibling thunk fields on existing cases, never parallel case copies.
3. **Pending vs noop uses the EXISTING three-state thunk protocol** (`test/util/validationAsserts.ts` `titleFor`/`resolveThunk`): an **omitted** thunk field renders "(not implemented)" = **pending** (a later milestone fills it); the **`'not-supported'` sentinel** = **noop by design**, always with a note explaining why (e.g. bigint has no JSON Schema form). No new skip mechanism is invented.
4. **Phase done =** every relevant suite's jsonSchema column is either filled or explicitly `'not-supported'`; a completion meta-check proves no "(not implemented)" omissions remain; full `pnpm test` green.
5. The serialization-suite thunk rule applies unchanged to the new thunks: **every jsonSchema thunk self-contained, schema literal inline** ([test/suites/serialization/CLAUDE.md](../../packages/ts-runtypes/test/suites/serialization/CLAUDE.md) — thunks feed doc/benchmark extraction later).
6. **Marker test coverage rule:** the new define-suite includes paired static `getRunTypeId<T>()` / reflection `getRunTypeId(value)` cases with a hash-equivalence assertion (see CLAUDE.md → Testing).

## Milestones

### M0 — scaffold (no kind coverage yet)

- Promote the prototype to the real subpath (`packages/ts-runtypes/src/json-schema/`; NOT `/schema` — that name is the value-first surface; naming per [04-migration-plan.md](../investigations/json-schema/04-migration-plan.md)). Public exports: the builder + `FromJsonSchema<S>` + the versioned input type. The prototype files in `test/features/` retire in favor of the real suites.
- Add the OPTIONAL jsonSchema thunk fields to `ValidationCase` (`validateJsonSchema`, `getValidationErrorsJsonSchema`) and `SerializationCase` (the four `jsonSchema*` encoder/decoder/binary thunks) so every existing case immediately reads "(not implemented)" — the pending ledger is born full and drains per milestone. Add a divergence opt-out flag for the new form (analogous to `idDivergent`, but a separate flag — the divergence sets differ per authoring form).
- New id-integrity driver file re-iterating the registries over the new thunks: factory-identity assertions for validators, byte-identity for serializers (mirror `suites/id-integrity/validators.test.ts` / `serializers.test.ts`).
- New `test/suites/json-schema-define/` suite mirroring `value-first-define`'s minimal two-file shape — home for schema-authoring-specific behavior: keyword-subset enforcement (unknown keyword ⇒ type-level rejection at the call site), ignored annotations (`$schema`/`title`/`description`/`examples`/`default`), `as const` module-const schemas, **idempotency** (same schema literal at two call sites/files → same cached factory; key-order permutation of the same schema → same id; three-way convergence type-first ↔ value-first ↔ jsonSchema), the marker-rule paired shapes, and mock soundness for schema-authored roots.
- Type-level budget/compile test via the `test/types/compileHarness.ts` + `#region`-slice convention (as `dataonly.compile.test.ts` does): the inference type carries extract markers from day one; per-milestone correctness + instantiation-ceiling cases accumulate.
- **Dependency:** land [mock-format-registry-side-effect-import.md](mock-format-registry-side-effect-import.md) first (its option 1 preferred) — schema users hit the footgun from type-only import graphs, and the subpath must not ship with it.

### M1 — atomics + atomic formats

Keywords: `type` (string/number/integer/boolean/null), `const`, `enum`, `format` (email/uuid/hostname/ipv4/ipv6/uri/date/time/date-time), `minLength`/`maxLength`, `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`/`multipleOf`.
Fill: validation ATOMIC group; format-validation STRING_FORMAT / NUMBER_FORMAT / DATETIME (ISO layouts); serialization + format-serialization atomic groups. Noop sweep with notes: bigint / BIGINT_FORMAT (no schema form), non-ISO datetime layouts, the NATIVE group members with no schema INPUT form (Date/Map/Set/RegExp/Temporal), TEMPLATE_LITERAL group (pattern → template type unrecoverable, by design). The `pattern` keyword: resolve the mockSamples policy recorded in [01-phase1-mapping.md](../investigations/json-schema/01-phase1-mapping.md) §5.11 before enabling it, or mark `'not-supported'` with the policy reference.

### M2 — arrays + tuples

`items`; `prefixItems` (+ rest via trailing `items`, optional members via `minItems`, closed tuples via `items: false`). Fill ARRAY + TUPLE groups everywhere.

### M3 — objects + records

`properties`/`required` (the object-level → property-level optionality inversion), `additionalProperties` (record form AND mixed-with-properties intersection), nested objects. Fill OBJECT group + every REALWORLD case expressible so far. Decide here: one schema-authored enrich case if the enrich span-extraction convention tolerates it; else document as covered by convergence (criteria: no disproportionate tooling change just for the case).

### M4 — unions + combinators

`anyOf`; the `type: [...]` array form; `allOf` → intersection; nullable idioms; `oneOf` accepted as a union with its exclusivity-weakening documented (the build diagnostic belongs to the later docs/diagnostics phase). Fill UNION group.

### M5 — utility types

Verify composition of the `/schema` utility builders over jsonSchema results — `partial` / `required` / `pick` / `omit` / `readonlyType` / `nonNullable` / `exclude` / `extract` compose generically (they take `RunType<T>`); `returnType` / `parameters` are noop (function territory). Fill UTILITY + TYPE_MAPPINGS groups.

### M6 — circular + $defs/$ref

Feasibility checkpoint FIRST: type-level `$defs` environment + root-recursion via the existing `Recursive`/`Self` machinery (`substituteself-extract` region and its budget harness are the precedent). Then non-recursive `$defs` lookup, then self-`$ref`. Fill CIRCULAR groups. Anything failing the checkpoint gets `'not-supported'` + a follow-up todo — never a silent gap.

### M7 — translation fuzz (analyze, then build)

Finding from the suite inventory: **no value-first fuzz lane exists to replicate** — every current lane is type-first source (`fuzz/core/typeGen.ts`) or direct-graph (`fuzz/core/runTypeGen.ts`, one consumer). So this is new construction, and its scope is deliberately NARROW: fuzz **the translation layer only** (`FromJsonSchema` — the one new, otherwise-unfuzzed code). Everything downstream of the recovered type is the same machinery the existing type-based lanes already fuzz, and structural-id convergence makes it literally the same cached factory object — so downstream parity oracles add zero coverage by construction.

Design fixed here: reuse `typeGen.ts`'s shape ADT; render each shape TWICE (type-first declaration AND schema literal) for the schema-expressible subset; seeded via `fuzz/core/seededRng.ts`.

- **The one load-bearing oracle: structural-id equality between the two renderings.** A translation bug produces the wrong `T` silently — downstream then works flawlessly on the wrong type, invisible to every type-first lane; id divergence is the total, cheap detector. When ids match, validate/serialize/mock equivalence is proven by construction (same cache entry).
- **Keep the `tsValidate`-style well-formedness filter** (a generated schema must satisfy the input type and compile) so generator bugs don't masquerade as findings.
- **Optional small negative lane**: malformed / unknown-keyword schemas must be REJECTED at the type level, never silently infer a weaker type. Finite keyword space — the implementer decides fuzz vs curated suite cases.
- **Explicitly NOT built** (redundant by id-transitivity): validate/serialization/mock parity oracles over schema inputs, schema-side value fuzzing, roundtrip oracles through the schema door.

The implementer designs generator details after reading `fuzz/core/` + `fuzz/type/typeFuzzRunner.ts`.

## The suite matrix (decided)

| Suite | Action | When |
| --- | --- | --- |
| `suites/validation` (184 cases) | add 2 jsonSchema thunk fields; fill per milestone; noop w/ notes | M0 fields, M1–M6 fill |
| `suites/format-validation` (104) | inherited fields; fill/noop | M1 (+DATETIME noops) |
| `suites/serialization` (174) | add 4 jsonSchema thunks; fill per milestone | M0 fields, M1–M6 fill |
| `suites/format-serialization` (34) | inherited; fill/noop | M1 |
| `suites/id-integrity` | NEW driver file over the new thunks + the divergence flag; extend `distinctness.test.ts` with jsonSchema-authored pairs | M0, live from M1 |
| `suites/json-schema-define` | NEW suite (value-first-define mirror): schema-specific behavior, idempotency, marker rule, mock soundness | M0 skeleton, grows every milestone |
| `test/types/` | budget/compile test for the inference type (compileHarness + `#region` convention) | M0, cases per milestone |
| `suites/cloning`, `format-transform`, `overrides`, `mocking` | NOT extended — covered by **convergence transitivity**: same structural id ⇒ same cached factory / registered graph ⇒ identical family behavior; the id-integrity driver is the proof. format-transform is additionally N/A (JSON Schema has no transform keywords). | — |
| `suites/enrich` | one schema-authored case if the span-extraction convention allows; else a transitivity note | M3 decision |
| Go suites (`ts-go-runtypes`) | NONE — the resolver never sees JSON Schema (it reflects the computed type); zero Go changes is a design invariant of this feature | — |

## Out of scope

Docs / website / benchmarks / e2e (next phase, planned once implementation finishes). Go-side changes of any kind (incl. JSI-style diagnostics). The derived OUTPUT direction (`createJsonSchemaFn`). draft-07 input. The `Not` refinement operator (separate todo). Cross-document `$ref`.

## Done when

- All suite-matrix rows complete; the completion meta-check shows zero "(not implemented)" jsonSchema omissions; every `'not-supported'` carries a note.
- The new id-integrity driver is green over every filled case; distinctness extended; idempotency cases green.
- Budget tests under their ceilings; full `pnpm test` + `pnpm run lint` green; marker-rule paired shapes present.
- Fuzz lane merged with a seeded soak run documented in the PR.

## Shipped (reconciliation, 2026-07-29)

Everything above landed as specified on `feature/json-schema-runtypes`, one commit per milestone (dependency fix → M0 → … → M7), each commit with the full `pnpm test` gate green. Deviations, resolutions and findings:

- **Registered-case reality vs the matrix's file totals:** the drivers register 166 validation / 99 format-validation / 155 serialization / 30 format-serialization cases (the matrix counted file totals including the unregistered Currency / CircularGuard siblings, which carry the fields per their own drivers' conventions). The completion meta-check (`suites/json-schema-define/completion.test.ts`) iterates the four registries and proves ZERO omitted jsonSchema fields and a `JSON Schema: `-prefixed note behind every `'not-supported'`.
- **`pattern` keyword: ENABLED** per the 04-migration-plan §1 resolution — sample-less validation works end-to-end (the brand rides `{source, flags}` params); `createMockDataFn` on a pattern-branded root throws the targeted register-samples error natively (pinned by the define suite's `mockSlug` case). The `FromJsonSchema` internals spell the brand as raw `TypeFormat<string, 'stringFormat', P>` because the `TF.String` alias's `pattern` param REQUIRES `mockSamples` (structurally identical, ids converge).
- **M3 enrich decision: covered by convergence transitivity** — the span-extraction convention (single Go-lifted `type Target =` spans) cannot see a schema const outside the span without disproportionate tooling; recorded as the header note in `suites/enrich/cases/index.ts`.
- **M6 checkpoint: PASSED in full** — no `'not-supported'` fallback needed. Root self-`$ref` (`#`), non-recursive `$defs` lookup, and recursive `$defs` all converge with their type-first twins (circular array, address book, linked list probes), with deep validation + mock soundness.
- **TS2589 discovery (M6):** the direct `FromJsonSchemaIn<Root, Root>` self-instantiation passed tsgo/vitest but blew npm-`tsc`'s instantiation depth during the `jsonSchema` overload/implementation compatibility check (the dist declaration build) — through the `RunType`/`InjectRunTypeId` phantom slots. Fixed by threading the root re-entry through a 1-tuple fixpoint parameter (`F[0]`, the `Recursive<Body>` deferral pattern from schema/static.ts) plus a `0 extends 1 & S` any-short-circuit on `FromJsonSchema`. Lesson recorded in the fromJsonSchema.ts header: vitest never runs `tsc`, so budget tests alone don't gate the declaration build.
- **M7 shipped as designed** (`test/fuzz/jsonschema/`: normalizer + renderer + unit pins + the id-equality integration lane; `rtx core fuzz jsonschema`; `RT_FUZZ_JSONSCHEMA_SOAK_MS` registered). Batch: seed `0x5eeded` × 100 iterations green. Documented soak: `RT_FUZZ_SEED=20260729`, 30s → 657 types, 0 violations, 0 invalid-TS false positives, 12 known-divergence skips.
- **The lane's first batch found a real convergence gap:** two-or-more structurally identical recursive containers (e.g. `{p1?: N1[]; kids2: N1[]}` via `$defs` or root `#`) diverged from the type-first twin. Initially filed as out of scope under the zero-Go-changes invariant, then pulled back in scope by the user and FIXED Go-side in the same branch: the root cause was stale-depth cycle-token reuse in the typeid pointer cache, closed by a lowlink cache gate (see [json-schema-shared-recursive-container-id-divergence.md](json-schema-shared-recursive-container-id-divergence.md)). The residual entry-point-anchoring half of the family was subsequently fixed in-branch too, via bisimulation-canonical cluster emission ([typeid-scc-entry-point-anchoring.md](typeid-scc-entry-point-anchoring.md)); the lane now runs unguarded.
- **Compile budgets** (one-way ratchet, re-baselined at each milestone's capability addition as sanctioned): final 13-branch baseline 522 / 275 / 1199 / 506 / 1056 / 827 / 1796 / 603 / 1556 / 1589 / 1273 / 1448 / 471 net instantiations.
- **Adjacent fixes shipped en route** (both reconciled into docs/done/): the mock-format-registry side-effect import (the M0 dependency) and the enrichCheck beforeAll hook-timeout flake (`hookTimeout: 30000`), which reproduced during the M0 baseline run.
