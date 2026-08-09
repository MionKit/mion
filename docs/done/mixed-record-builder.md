---
type: feature
spec: full-plan
status: done
created: 2026-08-09
completed: 2026-08-09
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

## What shipped — NO new API was needed

Both halves of the plan turned out to exist already; only the CONVERTER was
failing to use them. Measured before changing anything:

1. **Builders** — the `intersection(...)` builder already spells it, and every
   variant converges with its type-first twin:

       intersection(record(unknown()), object({name: string()}))         hdvHHn9
       intersection(record(unknown()), object({name: optional(string())})) om8GgCO
       intersection(record(unknown()), object({name: propMod({readonly: true}, string())})) dhPBhpV
       intersection(record(string()), object({id: union([literal('a'), literal('b')])})) nrDPr5h

   So the planned third `record` argument (or params-bag `properties` key) was
   NOT added: it would have been a second way to say what `intersection`
   already says exactly.

2. **Schema door** — `properties` beside `additionalProperties: <schema>`
   already lowers to that same intersection. The one shape that looked broken,
   `{name: string; [key: string]: unknown}`, only needed the right spelling for
   an unknown-valued index: `additionalProperties: {}` (an empty schema, which
   accepts anything) rather than `additionalProperties: true` (which reads as
   "no constraint" and leaves the object without an index). No door change.

3. **Convert printer** — the only real work. The builders target now prints
   `RT.intersection(RT.record(…), RT.object({…}))` and the schema target prints
   `properties` beside `additionalProperties`, instead of escaping. The same
   pass taught `record(...)` the key forms it always supported: any KEY type
   (`{[k: number]: V}` → `record(number(), V)`) and several signatures sharing
   one value type (`Record<K1 | K2, V>` → a union-keyed record).

**Still escaping, and correctly so:** a readonly member on the SCHEMA target
(standard `readOnly` is annotation-only by design, so the modifier rides the
embed — pre-existing rule, unchanged), several index signatures whose VALUE
types differ (one `record` carries one value type), and any non-string key on
the schema target (JSON object keys are strings — the format's limit).

## Tests

- `packages/ts-runtypes/test/features/mixedRecord.test.ts` — convergence pins
  for every variant (narrower / optional / readonly / typed index / number-keyed
  index beside a member), the two `record`-only index shapes, and the schema
  door spelling of each, in both marker call shapes where a value exists.
- `TestChain_IndexShapesPrintRecord` (internal/convert) — the chain oracle over
  all of them, asserting the printed spelling per target and an id-exact leg
  each way.

## Done when — met

`{name: string; [key: string]: unknown}` and its optional / readonly / narrower
variants are authorable value-first and as a standard JSON Schema, converge
with the type-first spelling, and the converter prints those forms instead of
escaping.
