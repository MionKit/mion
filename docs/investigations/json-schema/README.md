# JSON Schema investigation — closed

**Status: shipped.** These four documents are the design record that preceded the feature, kept for the reasoning behind the decisions. They are **not** the current API reference. For what actually shipped, read:

- User docs: [runtypes.pages.dev/guide/json-schema](https://runtypes.pages.dev/guide/json-schema) (source: [container/website/content/02.guide/02.json-schema.md](../../../container/website/content/02.guide/02.json-schema.md))
- Source of truth: [packages/ts-runtypes/src/json-schema/](../../../packages/ts-runtypes/src/json-schema/) — `runTypeFromJsonSchema` (the builder), `FromJsonSchema` / `JsonSchemaInput` / `ExactJsonSchema` (the type-level core)
- Implementation reconciliation: [docs/done/json-schema-first-class-implementation.md](../../done/json-schema-first-class-implementation.md) (M0–M7, with the deviations)
- Rollout reconciliation: [docs/done/json-schema-first-class-rollout.md](../../done/json-schema-first-class-rollout.md) (docs, playground, benchmarks, e2e)
- Scope + the value-first boundary reconciliation: [docs/ROADMAP.md](../../ROADMAP.md)

## The documents

| File | What it holds |
| --- | --- |
| [01-phase1-mapping.md](01-phase1-mapping.md) | Keyword-by-keyword mapping between JSON Schema and the RunTypes model |
| [02-phase2-first-class-input.md](02-phase2-first-class-input.md) | The input direction, and the prototype the shipped `fromJsonSchema.ts` was promoted from |
| [03-phase2-derived-output.md](03-phase2-derived-output.md) | The OUTPUT direction (`createJsonSchemaFn<T>()`), **not shipped** and still unscheduled |
| [04-migration-plan.md](04-migration-plan.md) | Sequencing, the `pattern` mockSamples policy, and the AJV-parity benchmark idea |
| [05-cost-and-direction-report.md](05-cost-and-direction-report.md) | What the feature actually cost, measured after the fact: code, binary size, runtime speed, correctness |

## Where the investigation was overtaken

- **`pattern` (04 §1).** The recorded policy was to reject or throw for mocking, because a schema pattern declares no `mockSamples`. Superseded: the build now auto-generates a deterministic sample pool from the regex, so `pattern` is fully enabled, validation and mocking both.
- **The AJV lane (04, "Benchmarks image").** Written against the OUTPUT direction (compile the *emitted* schema with AJV). The shipped lane is the input-direction twin: AJV compiles the *authored* literal, the same one `runTypeFromJsonSchema()` receives, which is the apples-to-apples comparison the benchmarks page now carries.
- **Zero Go-side changes.** Held for the initial rollout's translation layer, then broke decisively. `allOf`, `unevaluated*` and `additionalProperties` scoping pushed into tuple merging, intersection collapse and type identity: +2,651 Go lines by the re-apply and +3,025 more after it, so the extension phase added more Go than the rollout did. Measured in [05-cost-and-direction-report.md](05-cost-and-direction-report.md). The fuzz lane also surfaced two genuine typeid bugs in shared recursive containers, fixed Go-side in the same branch ([json-schema-shared-recursive-container-id-divergence.md](../../done/json-schema-shared-recursive-container-id-divergence.md), [typeid-scc-entry-point-anchoring.md](../../done/typeid-scc-entry-point-anchoring.md)); those were pre-existing id bugs the schema form exposed, not schema-specific work.
