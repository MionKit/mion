---
type: feature
spec: guidelines
status: ready
created: 2026-08-02
---

# Playground: JSON Schema as a third global authoring-mode selector

The playground briefly shipped JSON Schema as ONE preset in the example list.
That shape was not very usable (one isolated example instead of a real mode)
and was removed on the rollout branch; the engine capability stays — schema
mode runs `runTypeFromJsonSchema(...)` sources end-to-end and
[jsonSchema.test.ts](../../packages/ts-runtypes/test/playground/jsonSchema.test.ts)
keeps pinning the overlay exports map and the WASM lane (validate, id
injection, type-first convergence).

## Shape

JSON Schema becomes a THIRD option on the playground's global authoring
selector, next to the existing type / schema toggle, not a preset:

- Every preset example gains a `jsonSchema` source variant, the same way each
  one today carries the `ts` and `schema` variants, so switching the selector
  re-renders the CURRENT example in the chosen form.
- The engine already accepts the schema form through the value-first call
  shape (`createX(MyType)` with `const MyType = runTypeFromJsonSchema(...)`),
  so the selector work is UI + preset data, not engine work.
- Examples whose types have no JSON Schema spelling (Temporal, bigint, Map /
  Set...) need a decision per example: disable the option for that preset or
  swap to the closest expressible twin. Disabling with a short tooltip is the
  honest default.

## Done when

- The selector offers type / schema / JSON Schema globally; every preset
  either renders a real 2020-12 document or visibly opts out.
- The removed single-preset test is superseded by per-preset assertions (each
  jsonSchema variant parses, binds `MyType`, and validates its input).
- The playground page copy and the guide's playground mentions reflect the
  three-mode selector.
