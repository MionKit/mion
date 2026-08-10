---
type: feature
spec: guidelines
status: done
created: 2026-08-09
completed: 2026-08-10
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

### What shipped

Ten new dialect keywords, plus rows on the two that existed. Over the 205-file
suite corpus the escape count went from **992 to 227**, and the builders and
json-schema targets now refuse the **same 24 declarations** (they were 24 / 25;
the schema target's one extra refusal was the last shape only it could not
spell).

| Shape | Verdict in the audit | What shipped |
| --- | --- | --- |
| `Temporal.*`, all 8 | give it a `jsType` row | **Done.** Spelled by the REFLECTED format name (`temporalInstant`), not the qualified `Temporal.PlainDate`. The audit left this open; the format name won because the D1 guard (`temporalDtsGuard.test.ts`) forbids the characters `Temporal.` anywhere in the published `.d.ts`, and a key-remap template tripped it. It also means the unbranded row and its branded `jsFormat` twin share one word |
| Branded Temporal, 6 orderable families | give it a `jsFormat` row | **Done.** The blocker really did not hold: `TemporalBaseByFormatName` indexes the guarded bases, so the door never names the namespace |
| A `readonly` member | worst offender, wants a property-modifier keyword | **Done.** `jsReadonly`, named the way `required` names its own. A readonly member no longer drags its whole object into an escape |
| Structural param bags whose values equal a 2020-12 default | a structural `jsFormat` family would carry it | **Done**, as `jsParams` rather than a format family. `minItems: 0` says exactly what omitting the keyword says, so the door reads the standard spelling as absent — correct for 2020-12, so the fix carries those params beside it instead of changing what the standard keyword means |
| `typeMeta` / brand intersections | wants a keyword | **Done.** `jsMeta`, base beside its metadata objects. Composes with `jsReadonly`, which is how `string & {readonly __brand: 'UserId'}` converts whole |
| A `not` over a format | needs its own row | **Done.** `jsNot`. Verified rather than assumed: `{type: 'number', not: {…}}` really does collapse to `never` through the kind-complement algebra |
| Numeric or second index signature | the dialect can say it | **Done.** `jsIndexes`, one `{key, value}` pair per signature. Covers numeric, symbol, pattern and multi-signature keys; a pattern key nests a `jsTemplate` as its key |
| Function types | bigger design | **Done for the shape that survives.** `jsFunction` carries a params TUPLE schema plus a return schema, so parameter names ride the tuple's own `jsLabels`. Optional and rest parameters KEEP the escape, see below |
| Template literal types | needs a parts encoding | **Done.** `jsTemplate` carries the n+1 texts beside the n placeholder schemas |
| Method / call-signature members | blocked on the function row | **Still escapes**, and not because of that row. Method-ness is SYNTAX: `{f(): void}` and `{f: () => void}` are different member kinds with different ids, and no type-level construct builds a method member |
| bigint format with bigint params | investigate, do not assume it converges | **Done — the premise was wrong.** The audit assumed no type-level operation lifts a digit string to a bigint literal type. `infer N extends bigint` inside a template literal has done exactly that since TypeScript 4.8. Verified against negative controls (the lift must not land on the number `5`, on wide `bigint`, or on a non-numeric string). Bounds ride as digit strings |
| bigint literal (`123n`) | genuine limit | **Done, same correction.** `jsBigint` carries the digits |
| Enum reference | genuine limit | **Confirmed.** Nominal identity needs the live symbol |
| User class reference | genuine limit | **Confirmed** |
| Cross-declaration name reference | keep | **Kept**, as designed |

Two additions the audit did not list: `{jsType: 'object'}` for TypeScript's
`object` keyword (not the same type as a keyword-less object schema, which
recovers `Record<string, unknown>`), and the function caveat below.

### The one place two correct things could not both be had

A function with an OPTIONAL or REST parameter still escapes. The door spreads
the params tuple into a rest parameter, and the parameter names ride an
intersection on that tuple (the `__rtLabels` carriage the value-first slot form
uses). Materialising the signature through that intersection rewrites
`extra?: string` into a required `extra: string | undefined`, and folds a rest
slot into one spread parameter. Dropping the names keeps both — and loses every
parameter name, which folds into the id just as hard. Neither half can be given
up, so the escape carries the whole signature exactly. This is the same line
the value-first slot form already drew, for the same reason.

### Cost

The instantiation budgets moved up 2% to 9% per branch, logged as a reviewed
exception in `jsonSchema.compile.test.ts`. The seven discriminators that
REPLACE a translation sit behind one key-set probe (`DialectShapeKeys`) and the
two modifier keywords behind their own gate, so a schema using none of them
pays one conditional rather than one per keyword; that gating is the difference
between +2-9% and the +9-20% a flat ladder cost.

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

## Done when — met

Temporal converts to `jsType` / `jsFormat` rows instead of the embed escape,
ids unchanged on every leg (the chain oracle runs on every row) and
`--portable` refusing every one of them. Every remaining audit row is either
implemented or recorded above with its reason. `SchemaLoweringByKeyword` (the
machine-checked keyword table) carries a row per new keyword, and the website's
JSON Schema and converting-forms guides match what shipped.
