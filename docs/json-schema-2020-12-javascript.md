# JSON Schema 2020-12 JavaScript

A small, conservative extension to [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12) that records **what the validated JSON becomes in JavaScript**.

Status: specification. Version 1. Keyword prefixes `js`, `ts`, `rt`.

Every rule below carries an ID like `JS-DATE`.

## Why

JSON Schema describes JSON. JavaScript has types JSON has no word for: `bigint`, `Date`, `Map`, `Set`, `RegExp`, Temporal values, template literal types, functions, the `readonly` modifier. Those types still travel over the wire perfectly well, they just travel *as* something else. A `Date` travels as an ISO string. A `bigint` travels as a decimal string. A `Map` travels as an array of pairs.

Standard JSON Schema can describe the string and the array. What it cannot say is that the string should come back as a `Date`.

This extension adds that second half. It never replaces the first.

## The one rule

> **`CORE-INERT` — Deleting every extension keyword from a document must not change whether any JSON value validates against it.**

That is the whole design, and everything below follows from it.

A document in this dialect is a valid 2020-12 document. Draft 2020-12 requires an implementation to ignore keywords it does not recognise, so any standard validator reads one of these schemas, ignores the extension keywords, and enforces exactly the wire contract. Nothing is weakened and nothing is skipped.

A reader that *does* understand the extension gets one more thing: the JavaScript type on the other side of the decode.

```json
{"type": "string", "format": "date-time", "jsType": "Date"}
```

Every validator agrees this accepts `"2026-08-10T09:00:00Z"` and rejects `42`. A RunTypes-aware reader also knows the decoded value is a `Date`, not a `string`.

## What this is not

- **`CORE-SIBLING` — Not a replacement for `type`.** `jsType` sits *beside* `type`, never instead of it. A schema whose only kind information is an extension keyword is not conforming.
- **Not a second validation vocabulary.** No extension keyword narrows, widens or overrides an assertion. They are annotations in the 2020-12 sense.
- **Not a serialisation format.** It describes JSON that already exists; it does not prescribe how a value is encoded, only what the encoding means.

**`CORE-PRECEDENCE`** — because the extension keywords sit beside the standard
ones rather than replacing them, a schema can carry several at once and the
order they are read in has to be stated. A reader recovering a type takes the
FIRST of these that applies:

1. `tsMeta`, whose `base` is then read by these same rules
2. `jsType`
3. `rtFormat`
4. `tsFunction`, `tsTemplate`
5. the standard 2020-12 translation

The consequence worth spelling out: **when `jsType` is present, the wire
constraint keywords are descriptive only.** `{"type": "string", "format":
"date-time", "jsType": "Date"}` recovers `Date`, not a date-time-formatted
string, and not a `Date` carrying string parameters. The `format` describes the
JSON; the `jsType` decides the type. A reader that let both contribute would
give every `Date` a different identity from the one it was written with.

## Identification

The dialect is identified by the meta-schema URI:

```
https://runtypes.pages.dev/schema/2020-12-javascript
```

A document MAY declare it with `$schema`. A document that declares plain `https://json-schema.org/draft/2020-12/schema` and uses extension keywords is still conforming, because by `CORE-INERT` the keywords are inert to a plain 2020-12 reader. Declaring the dialect URI is a signal to tooling, not a requirement for correctness.

## Three prefixes, and what they promise

Every extension keyword answers one question by its prefix: **where do I go to learn what this value means?**

| Prefix | Defined by | Has a wire form | Read the docs at |
| --- | --- | --- | --- |
| `js` | JavaScript | yes, always | MDN |
| `rt` | RunTypes | yes, through standard constraint keywords | the RunTypes format reference |
| `ts` | TypeScript | **no**, ever | the TypeScript handbook |

`jsType: "Map"` names a real runtime value with a real encoding. `rtFormat: "email"` names a constraint family RunTypes defines, whose actual checks ride standard keywords. `tsReadonly` names a TypeScript type-system fact that no JSON value can witness.

That last row is the important one.

- **`TS-DROPPABLE`** — the `ts` keywords exist for exactly one purpose: to restore the original TypeScript type. They constrain nothing, a validator that drops them loses no checking, and a consumer that only cares about the data can strip every keyword starting with `ts` and lose nothing at all.
- **`TS-WIRE-HALF`** — because they carry no constraint, a `ts` keyword MUST be accompanied by whatever standard keywords describe its wire half. `tsIndexes` on a numeric-keyed index signature has to be written beside the `patternProperties` that constrains those keys, or the schema would be saying something to RunTypes that it does not say to anyone else, and `CORE-INERT` would break.

## Keyword summary

| Keyword | Extends | Carries |
| --- | --- | --- |
| `jsType` | `type` | the JavaScript type the wire form decodes to |
| `rtFormat` | `format` | the named type-format family the value belongs to |
| `rtFormatParams` | the constraint keywords | family parameters that have no standard keyword |
| `tsLabels` | `prefixItems` | tuple slot names |
| `tsReadonly` | `required` | the members that are `readonly` |
| `tsIndexes` | `additionalProperties` | index signatures whose key is not a plain string |
| `tsTemplate` | `pattern` | the parts of a template literal type |
| `tsFunction` | nothing standard | a function signature |
| `tsMeta` | nothing standard | a `base & {…}` metadata intersection |

One companion keyword rides beside a row rather than standing on its own:
`jsResolved` carries the resolved value's schema of a `jsType: "Promise"` and
is meaningful only in that pair (JS-PROMISE below).

Every one is optional. A document using none of them is ordinary JSON Schema.

**`CORE-PORTABLE`** — a *portable* document uses no extension keyword at all. The schema generator's `portable` option emits only portable documents, so a schema destined for a non-RunTypes consumer never silently depends on the extension.

---

## `jsType`

Names the JavaScript type the validated wire form decodes to. Always a sibling of the `type` (and, where one applies, `format` or `pattern`) that describes the wire.

### Values that travel as a string

| Rule | `jsType` | Wire schema | Decodes to |
| --- | --- | --- | --- |
| `JS-BIGINT` | `bigint` | `{"type": "string", "pattern": "^-?[0-9]+$"}` | `bigint` |
| `JS-DATE` | `Date` | `{"type": "string", "format": "date-time"}` | `Date` |
| `JS-REGEXP` | `RegExp` | `{"type": "string"}` | `RegExp` |

A `RegExp` encodes as `String(re)`, so the wire value carries the delimiters and flags (`"/^ab?c$/gi"`).

**`JS-BIGINT-LITERAL`** — a bigint LITERAL (`123n`) is the same row with the
value pinned. `const` holds the wire value, which is the string:

```json
{"type": "string", "const": "123", "jsType": "bigint"}
```

There is no separate keyword for it. A digit string under `const` with no
`jsType` beside it is an ordinary string literal, which is exactly the
distinction `jsType` exists to make.

### Temporal

| Rule | `jsType` | Wire schema | Decodes to |
| --- | --- | --- | --- |
| `JS-TEMPORAL-INSTANT` | `Temporal.Instant` | `{"type": "string", "format": "date-time"}` | `Temporal.Instant` |
| `JS-TEMPORAL-PLAINDATE` | `Temporal.PlainDate` | `{"type": "string", "format": "date"}` | `Temporal.PlainDate` |
| `JS-TEMPORAL-DURATION` | `Temporal.Duration` | `{"type": "string", "format": "duration"}` | `Temporal.Duration` |
| `JS-TEMPORAL-PATTERNED` | `Temporal.ZonedDateTime`, `Temporal.PlainTime`, `Temporal.PlainDateTime`, `Temporal.PlainYearMonth`, `Temporal.PlainMonthDay` | `{"type": "string", "pattern": "…"}` | the matching type |

The last row uses `pattern` rather than `format` on purpose. `Temporal.ZonedDateTime.toJSON()` produces RFC 9557 (`2026-08-10T09:00:00+02:00[Europe/Madrid]`), which is **not** a valid RFC 3339 `date-time`, and `PlainTime` / `PlainDateTime` / `PlainYearMonth` / `PlainMonthDay` carry no offset where the registered formats require one. Claiming `format: "date-time"` for those would be a false statement about the wire, and a standard validator that checks formats would reject valid data.

### Values that travel as a container

| Rule | `jsType` | Wire schema | Decodes to |
| --- | --- | --- | --- |
| `JS-MAP` | `Map` | `{"type": "array", "items": {"type": "array", "prefixItems": [K, V], "items": false, "minItems": 2}}` | `Map<K, V>` |
| `JS-SET` | `Set` | `{"type": "array", "items": V, "uniqueItems": true}` | `Set<V>` |

The type arguments are read out of the wire schema itself: a `Map`'s key and value are `prefixItems[0]` and `prefixItems[1]`, a `Set`'s item is `items`. There is no separate argument list, because the wire schema already had to say the same thing to be honest about the JSON.

### The absent values

| Rule | `jsType` | Wire schema | Decodes to |
| --- | --- | --- | --- |
| `JS-UNDEFINED` | `undefined` | `{"type": "null"}` | `undefined` |
| `JS-VOID` | `void` | `{"type": "null"}` | `void` |
| `JS-PROMISE` | `Promise` | the RESOLVED value's schema, under `jsResolved` | `Promise<T>` |

A `Promise` is not itself encodable, but a serialiser awaits it and writes the
resolved value, so the resolved value's schema is the wire form:
`{"jsType": "Promise", "jsResolved": {"type": "string"}}` is a promise of a
string.

Unlike `Map` and `Set`, this one needs its own key. Merging the annotation into
the resolved schema in place reads better and is wrong: `Promise<Set<null>>`
would put `jsType: "Promise"` onto a node already carrying `jsType: "Set"`, and
two annotations cannot share a node.

`undefined` and `void` are not "no wire form": they encode as JSON `null`, in an object member and in an array slot alike. Only at the top level of a document does the encoder produce the JavaScript value `undefined`, because a bare `undefined` is not a JSON document at all, and a schema is not a document position.

This is why they need a `jsType` rather than being written as plain `{"type": "null"}`: on the wire the three are indistinguishable, and only the annotation says which one the decoded value is.

**`JS-SYMBOL`** — a `symbol` cannot be encoded. Its identity is the symbol
itself and nothing survives a round trip through JSON, so the serialiser refuses
the kind outright rather than inventing a placeholder.

It still gets `{"jsType": "symbol"}`, with no wire keywords beside it — the same
position `tsFunction` is in. The annotation is not describing an encoding,
because there is none; it is recording which TypeScript type this was, so the
schema can convert back to it. Dropping the member instead would change the
type's identity, which is the one thing conversion may never do.

### The two broad types

| Rule | `jsType` | Wire schema | Decodes to |
| --- | --- | --- | --- |
| `JS-ANY` | `any` | *(none, so every value)* | `any` |
| `JS-OBJECT` | `object` | `{"type": ["object", "array"]}` | `object` |

`object` names the TypeScript `object` keyword, the non-primitive gate. It admits arrays, which is why its wire form is the two-member type union rather than `{"type": "object"}`. It is a different type from a schema with no keywords, which describes an ordinary open object.

---

## `rtFormat` and `rtFormatParams`

`format` in 2020-12 names a well-known string shape from a fixed registry. `rtFormat` names a **type-format family**: a base type plus a named, parameterised constraint set that the decoded value carries as part of its type. The families are RunTypes' own, which is why the prefix is `rt` and not `js`: there is no JavaScript "email type".

**`RT-FORMAT-NAME`** — `rtFormat` names the family. Where the standard registry has the right word, both keywords appear and agree:

```json
{"type": "string", "format": "email", "rtFormat": "email"}
```

The pair is not redundant. `format` tells a standard validator what to check; `rtFormat` tells a RunTypes reader which family the value belongs to, and two families can share one `format`:

```json
{"type": "string", "minLength": 3, "rtFormat": "stringFormat"}
{"type": "string", "minLength": 3, "format": "email", "rtFormat": "email"}
```

Both accept strings of at least three characters. They decode to different types, and only `rtFormat` says which.

**`RT-FORMAT-STANDARD`** — a family's parameters go on the **standard keyword** whenever one exists. This is what keeps a standard validator enforcing them:

| Parameter | Standard keyword |
| --- | --- |
| `minLength` / `maxLength` | `minLength` / `maxLength` |
| `pattern` | `pattern` |
| `min` / `max` | `minimum` / `maximum` |
| `gt` / `lt` | `exclusiveMinimum` / `exclusiveMaximum` |
| `multipleOf` | `multipleOf` |
| `minItems` / `maxItems` / `uniqueItems` | same |
| `minProperties` / `maxProperties` | same |

**`RT-FORMAT-PARAMS`** — `rtFormatParams` carries **all** of the family's
parameters, not only the ones the standard has no word for.

That is deliberate, and it was the one place implementation changed the design.
Every parameter folds into the type's identity, `mockSamples` (nested inside a
pattern bag) included, so carrying only the leftovers would silently change what
the type IS. And one authoritative copy makes reconstruction exact, where a
merge of two half-sources has to agree about precedence forever. The standard
keywords beside it are a faithful PROJECTION, generated from the same params, so
a plain validator still enforces everything it has a word for.

```json
{"type": "string", "format": "email", "rtFormat": "email", "rtFormatParams": {"localPart": {"maxLength": 64}}}
```

**`RT-FORMAT-PATTERN-FLAGS`** — the `pattern` row of that table has one condition. A 2020-12 `pattern` is a bare ECMA-262 source with no flag support, so a RunTypes pattern can only be projected onto it when its flags do not change what the regex matches:

| Flags | Projected? |
| --- | --- |
| `""` | Yes. The keyword says exactly what the parameter says. |
| `"u"` | Yes, unless the source uses a `\p{…}` / `\P{…}` property escape. `u` is what a bare standard `pattern` is read AS, so projecting it reproduces the source document; but `\p{L}` read without `u` degrades to a literal `p{L}` match, which would reject almost everything. |
| `"i"`, `"m"`, `"s"`, `"y"`, `"g"` | No. A standard validator cannot express them. Case-insensitivity in particular would silently become case-SENSITIVE and reject values the type accepts. |

When the projection is skipped the pattern still rides `rtFormatParams`, and the standard reading simply says less about the value. That direction is always sound. The opposite, a standard reading STRICTER than the type, is what this rule exists to prevent: `CORE-INERT` says deleting the extension keywords must not change a verdict, and a projection that over-rejects would change it.

Two cases make it load-bearing rather than decorative.

**`RT-FORMAT-BIGINT`** — a bigint family's bounds are bigints, and JSON has no bigint. They ride as decimal strings:

```json
{"type": "string", "pattern": "^-?[0-9]+$", "jsType": "bigint",
 "rtFormat": "bigintFormat", "rtFormatParams": {"min": "0", "max": "18446744073709551615"}}
```

**`RT-FORMAT-DEFAULT`** — a parameter whose value IS the standard keyword's default. `{"minItems": 0}` says exactly what omitting `minItems` says, so a reader cannot tell the two apart and the family's parameter would be lost. It goes in `rtFormatParams` instead, leaving the standard keyword's meaning untouched:

```json
{"type": "array", "items": {"type": "string"}, "rtFormat": "formattedArray", "rtFormatParams": {"minItems": 0}}
```

**`RT-FORMAT-NONVALIDATING`** — parameters that only affect mock generation or
input transformation (`mockSamples`, `trim`, `lowercase`) get no STANDARD
keyword: they do not describe what a validator enforces, so projecting them
would misrepresent the schema. They still ride `rtFormatParams` with the rest,
because they are part of the type's identity even though they constrain
nothing.

---

## `tsLabels`

**`TS-LABELS`** — tuple slot names, one per slot in order, the rest slot included.

```json
{"type": "array", "prefixItems": [{"type": "number"}, {"type": "number"}],
 "minItems": 2, "items": false, "tsLabels": ["x", "y"]}
```

Decodes to `[x: number, y: number]`. Slot names are part of a tuple's identity in TypeScript, so a labelled tuple and an unlabelled one are different types even though no JSON value can tell them apart, which is precisely why this is a `ts` keyword.

The list MUST cover every slot or it is ignored whole. A partial list would produce a tuple with some slots named, which TypeScript cannot express.

---

## `tsReadonly`

**`TS-READONLY`** — the members carrying the `readonly` modifier, named the way `required` names its own.

```json
{"type": "object", "properties": {"id": {"type": "string"}, "hits": {"type": "number"}},
 "required": ["id", "hits"], "tsReadonly": ["id"]}
```

Decodes to `{readonly id: string; hits: number}`.

This is **not** the standard `readOnly` keyword, which is an annotation about write access to a resource and constrains nothing about the shape. The two can coexist and mean different things.

---

## `tsIndexes`

**`TS-INDEXES`** — index signatures whose key `additionalProperties` cannot describe, one entry per signature.

```json
{"type": "object", "propertyNames": {"pattern": "^(?:0|[1-9][0-9]*)$"},
 "tsIndexes": [{"key": {"type": "number"}, "value": {"type": "string"}}]}
```

Decodes to `{[key: number]: string}`.

`additionalProperties` speaks about string keys only, and about all of them at once. It stays the right keyword for `{[key: string]: V}`. `tsIndexes` covers numeric keys, symbol keys, pattern keys (a `key` schema carrying `tsTemplate`), and shapes with more than one signature.

Per `TS-WIRE-HALF`, the wire half is not optional: JSON object keys are always strings, so a numeric or pattern key really does constrain the JSON and MUST also be written with `propertyNames` or `patternProperties`.

---

## `tsTemplate`

**`TS-TEMPLATE`** — the parts of a template literal type: `texts` holds the n+1 literal chunks, `placeholders` the n schemas between them.

```json
{"type": "string", "pattern": "^api/[\\s\\S]*/v[\\s\\S]*$",
 "tsTemplate": {"texts": ["api/", "/v", ""], "placeholders": [{"type": "string"}, {"type": "number"}]}}
```

Decodes to `` `api/${string}/v${number}` ``.

The pattern and the parts say the same thing to two different audiences. A pattern alone cannot rebuild the type, because reading a regular expression back into a template literal type is not decidable; the parts can, and per `TS-WIRE-HALF` the pattern is required so a standard validator still gets the real constraint.

The pattern pins the literal chunks and leaves every placeholder a wildcard, deliberately. A regex narrower than the placeholder's own type would reject strings the type accepts, and the surface is wider than it looks: TypeScript takes `v0x10`, `v007`, `v.5` and `v1e3` for `` `v${number}` ``. Under-constraining is recoverable (`tsTemplate` carries the exact shape); over-constraining would make the schema disagree with the type it decodes to, which `CORE-INERT` exists to prevent. `[\s\S]` rather than `.` because a placeholder may hold a line terminator.

Only placeholders TypeScript can interpolate appear here: `string`, `number`, `bigint`, and literal values. A literal placeholder is normally folded into the neighbouring text by the type checker before it is ever written down.

---

## `tsFunction`

**`TS-FUNCTION`** — a function signature. `params` is an ordinary tuple schema, `return` an ordinary schema.

```json
{"tsFunction": {
  "params": {"type": "array", "prefixItems": [{"type": "string"}], "minItems": 1, "items": false, "tsLabels": ["message"]},
  "return": {"type": "boolean"}}}
```

Decodes to `(message: string) => boolean`.

Functions have no wire form at all, so there is no `type` beside it and nothing for `TS-WIRE-HALF` to require. Using a tuple schema for the parameters means optional slots, a rest slot and the parameter names all come from keywords that already exist.

---

## `tsMeta`

**`TS-META`** — a `base & {…}` metadata intersection: the base schema beside the metadata objects conjoined onto it.

```json
{"tsMeta": {
  "base": {"type": "string"},
  "meta": [{"type": "object", "properties": {"__brand": {"const": "UserId"}}, "required": ["__brand"], "tsReadonly": ["__brand"]}]}}
```

Decodes to `string & {readonly __brand: 'UserId'}`, the usual way a nominal brand is written in TypeScript.

The base is nested under the keyword rather than sitting beside it because a base may itself carry a `jsType` or `rtFormat`, and those are read first.

Only the base describes the wire. The metadata objects are phantom: they exist in the type and never in the JSON, which is why the wire contract of a `tsMeta` schema is exactly the wire contract of its base.

---

## Conformance

An implementation of this dialect:

1. MUST validate the document as draft 2020-12, ignoring the extension keywords for that purpose.
2. MUST NOT let any extension keyword change a validation verdict (`CORE-INERT`).
3. SHOULD reject an extension keyword whose sibling wire keywords contradict it (`{"type": "number", "jsType": "Date"}` is not meaningful, since a `Date` travels as a string).
4. MAY ignore any extension keyword it does not implement, and MUST fall back to the wire type when it does.
5. MUST treat every `ts`-prefixed keyword as droppable (`TS-DROPPABLE`): stripping all of them leaves a document that validates identically and describes the same JSON.

## Relationship to RunTypes

RunTypes writes this dialect through the schema generator (`createJsonSchemaFn` / `createStandardSchema`); its `portable` option strips every extension keyword.

The executable twin of this spec is the conformance test at `packages/run-types/test/features/jsonSchemaDialectSpec.test.ts`: one case per rule ID, driving each type through the runtime schema generator and asserting the document the rule requires. A coverage check reads this file and fails when a declared rule has no case, and when a case tests a rule this file does not declare. A rule that is not tested does not exist.
