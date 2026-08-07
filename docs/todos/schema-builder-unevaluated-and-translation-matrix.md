---
type: feature
spec: guidelines
status: ready
created: 2026-08-07
---

# Builder surface, the remainder: the unevaluated option and the translation matrix

Split from [schema-builder-gaps.md](../done/schema-builder-gaps.md) when its
three builders (`RT.dependentRequired` / `RT.dependentSchemas` /
`RT.conditional`) shipped. This is the part that did not.

## 1. The unevaluated option on composition builders

The schema door attaches `__rtUnevaluated` group slots (keys / sources /
groups with When / WhenNot guards). The builder spelling is an options bag
on the composition builders — `RT.intersection(arms, {unevaluatedProperties:
false})` and the array twin (an `RT.array(item, {unevaluatedItems: false})`-
adjacent shape, decided against the door's exact slot encoding during
implementation) — producing the same slot shape from the arms' types.

Follow the pattern the dependent* work proved: extract the slot-building
leaf from fromJsonSchema.ts (type-only export) and have the builder return
exactly it, so door and builder share ONE lowering and converge by
construction.

The guide's Unevaluated table still shows placeholder builder cells
(`RT.object(config)` / `RT.array(item)`,
[02.json-schema.md](../../container/website/content/2.guide/02.json-schema.md)
lines ~185-186); those rows become the real calls.

Tests: per feature, an id-convergence pin (`runTypeFromJsonSchema(schema)`
and the builder spelling resolve to ONE cache entry; the marker rule's two
`getRunTypeId` call shapes apply where the marker API is exercised), plus
behavior (validate + validationErrors + mock) mirroring the door's
official-suite behavior for the same schema.

## 2. The translation matrix (pointer, not a plan)

The larger program the builders serve: types ⇄ builders ⇄ schema.

- toJsonSchema emitter — the derived-output leg (background in
  [docs/investigations/json-schema/03-phase2-derived-output.md](../investigations/json-schema/03-phase2-derived-output.md)).
- A round-trip lane (schema → builders → schema; type → schema → type).
- A zod-interface builder.

Each of these is a feature in its own right and wants its own spec before
implementation; this section exists so the program is not lost with the
split, and section 1 is the part that is ready to build now.

## Done when

- The composition builders accept the unevaluated options and converge with
  the door (convergence + behavior pins in the json-schema-define suite).
- The guide's Unevaluated rows show the real builder calls.
- The matrix legs are either specced as their own todos or explicitly
  dropped, and this file moves to docs/done recording which.
