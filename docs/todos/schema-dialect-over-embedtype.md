---
type: feature
spec: guidelines
status: ready
created: 2026-08-09
---

# Spell natively supported shapes with `jsType` / `jsFormat`, not `embedType`

## Intent

The json-schema convert target reaches for the `embedType` escape far more often
than the dialect requires. `embedType` carries a quoted TypeScript type, which
means the node stops being data: it cannot be serialised, cannot be read by any
tool that is not the TypeScript compiler, and drops the whole subtree out of the
schema's own vocabulary. It exists as a last resort and should be used as one.

The policy this todo asks for: **if RunTypes reflects a shape natively, the
dialect should be able to spell it.** `jsType` and `jsFormat` are ours to
extend, so a shape reaching the escape should be a shape that genuinely cannot
be written as data (nominal identity, or a value JSON cannot hold), not one we
simply have not given a row yet.

Temporal is the clearest case and the one that prompted this. Temporal types are
reflected exactly like `Date` / `Map` / `Set` (`KindClass` +
`SubKindTemporal*`, `internal/reflection/subkind.go:36-43`), those three have
`jsType` rows, and Temporal does not, so it escapes:

    export type Booking = {at: Temporal.PlainDate};

    $ ts-runtypes convert --to json-schema src/booking.ts
    {type: 'object', properties: {at: embedType<Temporal.PlainDate>()}, required: ['at']}

It should read `{jsType: 'Temporal.PlainDate'}`. Branded Temporal
(`TFT.PlainDate<{min: '2020-01-01'}>`) is the same story one level up: it embeds
the brand where every other format family rides `jsFormat`.

The dialect's keyword tables live in `SchemaLoweringByKeyword`
(`packages/ts-runtypes/src/json-schema/fromJsonSchema.ts`, near the end) and on
the website's JSON Schema keyword page; this todo is about widening its
coverage.

## Direction

### The Temporal blocker does not hold

[convert-temporal-support.md](../done/convert-temporal-support.md) put "`jsType`
Temporal rows in the schema door" out of scope on one stated ground: the door
would then name `Temporal.*`, dragging the Temporal lib onto every consumer of
the json-schema subpath. That reasoning was sound in general and is already
solved in this repo specifically.

`temporalFormats.ts:71` defines the guarded reference the whole formats surface
already runs on:

```ts
type TemporalInstanceOf<K extends string> =
  typeof globalThis extends {Temporal: Record<K, {prototype: infer I}>} ? I : unknown;
```

It resolves to the real instance type when the consumer's `lib` provides
Temporal and degrades to `unknown` when it does not, which is exactly why
`formats/temporal` can be imported by the root marker surface without forcing
the lib on anyone. `TemporalBaseByFormatName` (`temporalFormats.ts:121`) already
maps every temporal format name to its guarded base type, so the door has a
ready-made table to index rather than new `Temporal.*` references to write.

Note the position rule in that file's comment block before reusing it: the
`unknown`-falling guard is for intersection positions, the `never`-falling one
for union-keep positions. Picking the wrong one is silent and poisonous
(`unknown` absorbs a union), and `dataonlyTemporalPosture.test.ts` pins that
lesson.

Whether the `jsType` value should be `'Temporal.PlainDate'` (qualified, matching
the source spelling) or `'temporalPlainDate'` (matching the reflected format
name) is an open call for the implementer.

### Audit of what escapes today

Every row below was confirmed against the real binary or the Go tests. The
verdict column is a starting position, not a decision.

| Shape | Escapes at | Verdict |
| --- | --- | --- |
| `Temporal.*`, all 8 | `print.go:2139` (KindClass fallthrough) | **Give it a `jsType` row** — direct parallel of the Date / Map / Set cases in the same switch |
| Branded Temporal, 6 orderable families | `print.go:2004-2017` | **Give it a `jsFormat` row** — params are plain strings, so nothing blocks it but the lib question above |
| A `readonly` member | `print.go:2232-2240` | **Worst offender.** One `readonly` member escapes the **whole object**, so every sibling property loses its standard spelling too. Wants a property-modifier keyword |
| Structural param bags whose values equal a 2020-12 default | `print.go:2082`, `print.go:2194` | Escapes because the standard keyword would read back as absent. A structural `jsFormat` family would carry it exactly |
| `typeMeta` / brand intersections | `print.go:1966-1968` | Reflected natively; wants a keyword |
| A `not` over a format | `print.go:1977-1993` | Reflected natively; the standard `not` runs a different algebra, so this needs its own row |
| Numeric or second index signature | `print.go:2204-2209` | Reflected natively; JSON keys are strings, but the dialect can say it |
| Function types | `print.go:2309-2310` | Reflected natively (with slot labels). Bigger design — params, return, optional and rest slots |
| Template literal types | `print.go:2309-2310` | Reflected natively. Needs a parts encoding; a pattern alone cannot rebuild the type |
| Method / call-signature members | `print.go:2201-2203` | Blocked on the function row above |
| bigint format with bigint params | `print.go:2026-2033` | **Investigate.** Params would have to ride as digit strings, and `{min: 5n}` vs `{min: '5n'}` are different types — check what the id fold actually reads before assuming it converges |
| bigint literal (`123n`) | `print.go:2062-2075` | **Genuine limit.** No type-level operation lifts a digit string back to a bigint literal type |
| Enum reference | `print.go:2142-2143` | **Genuine limit.** Nominal identity needs the live symbol |
| User class reference | `print.go:2139` | **Genuine limit.** Same |
| Cross-declaration name reference | `print.go:164` | **Keep.** This is the reference mechanism working as designed |

The escape stays for the last four. Everything above them is a keyword we chose
not to write yet.

### Pointers

- Door input surface: `JsTypeName` (`fromJsonSchema.ts:107`), `JsFormatName`
  (`:115`), `FromJsFormat` (`:129`), `FromJsTypeName` (`:1799`), and the
  resolution order at `:1772-1795`.
- `SchemaLoweringByKeyword` (`fromJsonSchema.ts`, near the end) is total and
  machine-checked: a new keyword that has no row there fails to compile. Use it.
- Emitter: the kind switch in `print.go:2039-2312`; the `dialect()` helper at
  `:1970` is what makes a row refuse under `--portable`.
- Every row added is a row `--portable` must keep refusing. That flag's contract
  is "standard 2020-12 only", so widening the dialect never widens `--portable`.
- Each row needs the chain oracle (type → builders → json-schema → type, ids
  equal on every leg) and a `--portable` refusal test, mirroring
  `temporal_test.go`.

The implementer plans the details: which rows to take in what order, the value
spellings, whether the readonly and structural cases share one keyword or want
separate ones, and how far to go before stopping.

## A separate thing to watch

Convert resolves against a program whose roots are only the named files, so a
type it cannot see resolves to `any`
([program-roots-lose-ambient-declarations.md](program-roots-lose-ambient-declarations.md)).
This bites Temporal specifically: a project whose Temporal declarations arrive
through an unimported polyfill `.d.ts` trips CNV007 even though the project is
correctly configured. That is that todo's problem, not this one (it also
documents how the failure compounds across declarations), but a Temporal fix
landing here will look broken in exactly that setup, so check which one you are
actually looking at before blaming your new `jsType` row.

## Done when

Temporal converts to `jsType` / `jsFormat` rows on the schema target instead of
the embed escape, ids unchanged on every leg and `--portable` still refusing;
the remaining rows in the audit table are either implemented, or recorded with a
reason for staying on the escape; the dialect spec's keyword tables and open
points match what shipped.
