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

## Cut from this spec (dropped, to be re-filed when scheduled)

The unevaluated option on the composition builders and the broader
translation matrix (toJsonSchema emitter, round-trip lane, zod-interface
builder) did not ship here, and on 2026-08-07 were deliberately dropped
from the backlog rather than kept as an open spec — neither is planned
near-term, and a fresh spec will be filed when the work is scheduled. The
essence to carry into that spec: the builder spelling for unevaluated is an
options bag on the composition builders (`RT.intersection(arms,
{unevaluatedProperties: false})` and an array twin) that must reuse the
door's `__rtUnevaluated` slot-building leaf exported type-only from
fromJsonSchema.ts, exactly the way the dependent* leaves were shared — one
lowering, two entrances, id-convergence by construction. The guide's
Unevaluated table rows (02.json-schema.md) still show placeholder builder
cells and become the real calls when it lands.
