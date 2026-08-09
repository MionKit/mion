---
type: feature
spec: full-plan
status: ready
created: 2026-08-09
---

# A value-first and schema spelling for a mixed record (named props + index)

## Problem

`{name: string; [key: string]: unknown}` is an ordinary TypeScript shape with
no spelling in either of the other two authoring forms:

- **builders** — `object(...)` carries named members but no index; `record(...)`
  carries an index but no named members. There is no intersection builder.
- **json-schema** — the natural document IS standard 2020-12
  (`properties` beside `additionalProperties`), but the door's `FromJsonSchema`
  drops the index: `{type:'object', properties:{name:{type:'string'}},
  additionalProperties:true}` recovers `{name: string}` (id `uYKsQ2K`), not the
  mixed shape (id `hdvHHn9`).

So `ts-runtypes convert` escapes the declaration on both targets
(`getRunType<T>()` / `embedType<T>()`). It converts and keeps its id, but the
result is opaque rather than authored.

## The shape of the answer, measured

An INTERSECTION spells it exactly. Every variant converges with its
single-object twin (ids from a real resolver run):

    Record<string, unknown> & {name: string}          === {name: string; [key: string]: unknown}      hdvHHn9
    Record<string, unknown> & {name?: string}         === {name?: string; [key: string]: unknown}     om8GgCO
    Record<string, unknown> & {readonly name: string} === {readonly name: string; [key: string]: …}   dhPBhpV
    Record<string, string>  & {id: 'a' | 'b'}         === {id: 'a' | 'b'; [key: string]: string}      nrDPr5h

## Why an array of prop NAMES is not enough

The named members beside an index are not constrained to the index's type —
TypeScript only requires each one to be ASSIGNABLE to it. All three of these
are legal, and all three are distinct types:

- a NARROWER type: `{name: string; [key: string]: unknown}` — the common case,
  and the one the opening example uses;
- OPTIONAL: `{name?: string; [key: string]: unknown}`;
- READONLY: `{readonly name: string; [key: string]: unknown}`.

A list of names can express none of them: it forces every prop to the index's
own type, which is a different type and a different id
(`{name: unknown; …}` is `igiWMQe`, not `hdvHHn9`).

So the props argument must carry a RunType per prop, exactly like `object(...)`
already does — which also gets `optional(...)` / `propMod(...)` for free.

## Plan

1. **Builders** — a third argument of named members on `record`:

       record(TF.unknown(), {minProperties: 2}, {name: TF.string()})
       // → Record<string, unknown> & {name: string}

   The 2-arg and 3-arg overloads are already taken (`record(value, params)`,
   `record(key, value, params)`), so decide the surface first: a 4th positional
   is unreadable, and the alternative is a `properties` key INSIDE the params
   bag (`record(TF.unknown(), {properties: {name: TF.string()}})`), which reads
   well and mirrors the JSON Schema keyword of the same name. Recommend the
   params-bag key. Reuse `ObjectType<C>` for the members half so the modifier
   profiles behave identically to `object(...)`.

2. **Schema door** — lower `properties` beside `additionalProperties: S` to the
   same intersection, so the standard document round-trips. This is the
   type-level change (`src/json-schema/fromJsonSchema.ts`) and needs its own
   instantiation-budget check, since every object schema pays the probe.

3. **Convert printer** — emit the new spellings instead of escaping
   (`internal/convert/print.go`, the object branch of `builderExpr` /
   `schemaExpr`, where the mixed case currently routes to
   `builderEscape` / `schemaEmbedNode`).

## Tests

- Convergence pins for all four variants above (narrower / optional / readonly
  / typed index), in BOTH marker call shapes.
- A convert chain test: mixed record → builders → json-schema → type, id-exact
  per leg, replacing the escape assertions in
  `TestChain_IndexShapesPrintRecord`.
- The `unsupported-conversion` list loses nothing (the mixed case is not on it
  — it escapes today rather than refusing), but the website's "what does not
  convert" prose mentions index shapes an escape carries; update it.

## Done when

`{name: string; [key: string]: unknown}` and its optional / readonly / narrower
variants are authorable value-first and as a standard JSON Schema, converge
with the type-first spelling, and the converter prints those forms instead of
escaping.
