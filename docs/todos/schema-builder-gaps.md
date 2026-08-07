---
type: feature
spec: full
status: in-progress
created: 2026-08-07
shipped-so-far: RT.dependentRequired, RT.dependentSchemas, RT.conditional (convergence + behavior pinned in builderGaps.test.ts; guide table updated). OPEN - the unevaluated option on composition builders, and the broader translation matrix (toJsonSchema emitter, round-trip lane, zod-interface builder) which folds into this program.
---

# Close the four builder gaps: dependent*, conditional, unevaluated

The value-first surface has a first-class, id-convergent builder for every
JSON Schema feature EXCEPT four, where the guide's builder column is an
assembly recipe ("RT.union([...])") instead of a builder. A schema → builder
translator (the first leg of the types ⇄ builders ⇄ schema matrix) cannot
round-trip a recipe: the intent is lost the moment it is expanded. This spec
adds the builders, wired so door and builder share ONE lowering.

Decisions already taken (session 2026-08-07):

- The if/then/else builder is **`RT.conditional({if, then, else})`** — object
  argument keeping the schema's vocabulary; bare `ifThenElse` reads like
  control flow and `if` is reserved.
- Lands on PR #321 (feature/json-schema-finish).

## The convergence architecture (what the investigation found)

- **`Conj<A, B>` is not `A & B`.** fromJsonSchema.ts's conjunction distributes
  over union arms and reduces contradictory kind pairs to never
  (`ConjPair`). The door's dependent*/ITE layers conjoin with it, so the
  builders' RETURN TYPES must be built with the same `Conj` — an
  `RT.intersection` spelling can never converge. Export the needed leaves
  from fromJsonSchema.ts (type-only) rather than duplicating them.
- **`DepRequiredArm<K, Reqs>` is already pure** (keys in, type out) — direct
  reuse. `DepSchemaArm<K, B, Root, F>` recurses into the schema; extract
  `DepSchemaArmOf<K, T>` (consequence TYPE in) and have the door's arm call
  it with `FromJsonSchemaIn<B>`. `KeysToTuple` + the folds reuse as-is.
- **The ITE else-arm is the hard part.** The door computes
  `NegationOf<IfSchema>` (name-set negation probed from the SCHEMA); a
  builder only holds the if-arm's TYPE. The shared leaf must therefore be
  type-parameterized (`TF.Not`-style: per-arm NotSlot with literal verdicts
  probed from the type), and the DOOR's IteFrom must be re-pointed at it.
  That may move ITE ids relative to the current branch state — acceptable
  NOW because nothing on this branch is released; it stops being acceptable
  the moment it ships. Verify `NegationOf<S>` vs `NotOfType<FromJsonSchema<S>>`
  over the official-suite ITE cases before re-pointing; divergences here are
  bugs in one of the two encodings.
- **Unevaluated**: the door attaches `__rtUnevaluated` group slots
  (keys/sources/groups with When/WhenNot guards). The builder spelling is an
  options bag on the composition builders (`RT.intersection(arms,
  {unevaluatedProperties: false})` and the array twin), producing the same
  slot shape from the arms' types. Extract the slot-building leaf.

## Builder signatures

- `RT.dependentRequired({card: ['cvv', 'billingAddress']})` →
  `Conj`-fold of `DepRequiredArm` per key. Compose beside an object via the
  schema-door style conjunction, not RT.intersection.
- `RT.dependentSchemas({card: RT.object({...})})` → fold of
  `DepSchemaArmOf<K, T>` per key.
- `RT.conditional({if: c, then: t, else: e})` → `Conj<C, T> | Conj<NotOfType<C>, E>`
  with the door's short-circuits mirrored (`if` accepting everything → then
  branch only; missing branch → unknown).
- `RT.intersection(arms, {unevaluatedProperties: false})` /
  `RT.array(item, {unevaluatedItems: false})`-adjacent spelling — final shape
  decided against the door's exact slot encoding during implementation.

## Test plan (the point of the whole exercise)

- Per feature: an id-convergence pin — `runTypeFromJsonSchema(schema)` and
  the builder translation of the same schema resolve to ONE cache entry.
  Marker rule applies (both `getRunTypeId` call shapes) where the marker API
  is exercised.
- Behavior: validate + validationErrors + mock for each builder, mirroring
  the door's official-suite behavior for the same schema.
- The official lane stays green; if re-pointing IteFrom moves ids, the lane
  must show ZERO behavior change (ids are not behavior).
- Guide table: the four rows' builder column becomes the real builder call.

## Done when

- The four builders exist, documented, with convergence + behavior pins.
- fromJsonSchema.ts's dependent*/ITE layers consume the SAME exported leaves
  the builders use (one lowering, two entrances).
- The guide's keyword table has no assembly-recipe rows left.
- This spec moves to docs/done with the shipped record.
