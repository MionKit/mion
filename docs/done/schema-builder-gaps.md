---
type: feature
spec: full
status: done
created: 2026-08-07
done: 2026-08-07
---

# Close the builder gaps: dependentRequired, dependentSchemas, conditional

Shipped on main (`f9cc0e4`, the json-schema finish work). The value-first
surface had a first-class, id-convergent builder for every JSON Schema
feature except four, where the guide's builder column was an assembly recipe
("RT.union([...])") instead of a builder. Three of the four are now real
builders; the fourth (unevaluated) was split out, see "Cut" below.

## What shipped

- `RT.dependentRequired({card: ['cvv', 'billingAddress']})`.
- `RT.dependentSchemas({card: RT.object({...})})`.
- `RT.conditional({if: c, then: t, else: e})` — object argument keeping the
  schema's vocabulary (decided 2026-08-07; bare `ifThenElse` reads like
  control flow and `if` is reserved). The door's short-circuits are
  mirrored: an `if` accepting everything asserts only the then branch, a
  missing branch is unknown.
- One lowering, two entrances: fromJsonSchema.ts exports the type-only
  leaves (`Conj`, `DepRequiredArm`, `DepSchemaArmOf`, `DepRequiredFold`,
  `DepSchemasFoldOf`) and the builders return exactly those types, so the
  schema door and the builder spelling converge to one cache id by
  construction — an `RT.intersection` spelling could never converge because
  `Conj` distributes over union arms and reduces contradictory kind pairs
  to never.
- Convergence + behavior pinned in
  `packages/ts-runtypes/test/suites/json-schema-define/builderGaps.test.ts`;
  the guide keyword table's dependent* and if/then/else rows now show the
  real builder calls (02.json-schema.md).

## Cut from this spec (split, not parked)

The unevaluated option on the composition builders and the broader
translation matrix (toJsonSchema emitter, round-trip lane, zod-interface
builder) did not ship here. They stand on their own in
[docs/todos/schema-builder-unevaluated-and-translation-matrix.md](../todos/schema-builder-unevaluated-and-translation-matrix.md).
