# JSON Schema 2020-12 JavaScript

A small, conservative extension to [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12) that records **what the validated JSON becomes in JavaScript**.

Status: specification. Version 1. Keyword prefixes `js`, `ts`, `rt`.

## Why

JSON Schema describes JSON. JavaScript has types JSON has no word for: `bigint`, `Date`, `Map`, `Set`, `RegExp`, Temporal values, template literal types, functions, the `readonly` modifier. Those types still travel over the wire perfectly well, they just travel *as* something else. A `Date` travels as an ISO string. A `bigint` travels as a decimal string. A `Map` travels as an array of pairs.

Standard JSON Schema can describe the string and the array. What it cannot say is that the string should come back as a `Date`.

This extension adds that second half. It never replaces the first.

## The one rule

> **Deleting every extension keyword from a document must not change whether any JSON value validates against it.**

That is the whole design, and everything below follows from it.

A document in this dialect is a valid 2020-12 document. Draft 2020-12 requires an implementation to ignore keywords it does not recognise, so any standard validator reads one of these schemas, ignores the extension keywords, and enforces exactly the wire contract. Nothing is weakened and nothing is skipped.

A reader that *does* understand the extension gets one more thing: the JavaScript type on the other side of the decode.

```json
{"type": "string", "format": "date-time", "jsType": "Date"}
```

Every validator agrees this accepts `"2026-08-10T09:00:00Z"` and rejects `42`. A RunTypes-aware reader also knows the decoded value is a `Date`, not a `string`.

## What this is not

- **Not a replacement for `type`.** `jsType` sits *beside* `type`, never instead of it. A schema whose only kind information is an extension keyword is not conforming.
- **Not a second validation vocabulary.** No extension keyword narrows, widens or overrides an assertion. They are annotations in the 2020-12 sense.
- **Not a serialisation format.** It describes JSON that already exists; it does not prescribe how a value is encoded, only what the encoding means.

## Identification

The dialect is identified by the meta-schema URI:

```
https://runtypes.pages.dev/schema/2020-12-javascript
```

A document MAY declare it with `$schema`. A document that declares plain `https://json-schema.org/draft/2020-12/schema` and uses extension keywords is still conforming, because by the one rule above the keywords are inert to a plain 2020-12 reader. Declaring the dialect URI is a signal to tooling, not a requirement for correctness.

## Three prefixes, and what they promise

Every extension keyword answers one question by its prefix: **where do I go to learn what this value means?**

| Prefix | Defined by | Has a wire form | Read the docs at |
| --- | --- | --- | --- |
| `js` | JavaScript | yes, always | MDN |
| `rt` | RunTypes | yes, through standard constraint keywords | the RunTypes format reference |
| `ts` | TypeScript | **no**, ever | the TypeScript handbook |

`jsType: "Map"` names a real runtime value with a real encoding. `rtFormat: "email"` names a constraint family RunTypes defines, whose actual checks ride standard keywords. `tsReadonly` names a TypeScript type-system fact that no JSON value can witness.

That last row is the important one. The `ts` keywords exist for exactly one purpose: to restore the original TypeScript type. They constrain nothing, a validator that drops them loses no checking, and a consumer that only cares about the data can strip every keyword starting with `ts` and lose nothing at all.

Because they carry no constraint, a `ts` keyword MUST be accompanied by whatever standard keywords describe its wire half. `tsIndexes` on a numeric-keyed index signature has to be written beside the `patternProperties` or `propertyNames` that constrains those keys, or the schema would be saying something to RunTypes that it does not say to anyone else, and the one rule above would break.

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

Every one is optional. A document using none of them is ordinary JSON Schema.

There is deliberately no keyword for negation. JavaScript has no "not this type", and RunTypes' negation type exists precisely to model JSON Schema's `not`, so a negated format is written with the standard keyword and nothing else:

```json
{"type": "string", "not": {"format": "email"}}
```

A standard validator reads that as "a string that is not an email address", which is exactly what it means. Adding an extension spelling beside it would be inventing a second way to say one thing.

---

## `jsType`

Names the JavaScript type the validated wire form decodes to. Always a sibling of the `type` (and, where one applies, `format`) that describes the wire.

### Values that travel as a string

| `jsType` | Wire schema | Decodes to |
| --- | --- | --- |
| `bigint` | `{"type": "string", "pattern": "^-?[0-9]+$"}` | `bigint` |
| `Date` | `{"type": "string", "format": "date-time"}` | `Date` |
| `RegExp` | `{"type": "string", "pattern": "^/.*/[dgimsuvy]*$"}` | `RegExp` |
| `Temporal.Instant` | `{"type": "string", "format": "date-time"}` | `Temporal.Instant` |
| `Temporal.PlainDate` | `{"type": "string", "format": "date"}` | `Temporal.PlainDate` |
| `Temporal.Duration` | `{"type": "string", "format": "duration"}` | `Temporal.Duration` |
| `Temporal.ZonedDateTime` | `{"type": "string", "pattern": "…"}` | `Temporal.ZonedDateTime` |
| `Temporal.PlainTime` | `{"type": "string", "pattern": "…"}` | `Temporal.PlainTime` |
| `Temporal.PlainDateTime` | `{"type": "string", "pattern": "…"}` | `Temporal.PlainDateTime` |
| `Temporal.PlainYearMonth` | `{"type": "string", "pattern": "…"}` | `Temporal.PlainYearMonth` |
| `Temporal.PlainMonthDay` | `{"type": "string", "pattern": "…"}` | `Temporal.PlainMonthDay` |

Four of the Temporal types use `pattern` rather than `format` on purpose. `Temporal.ZonedDateTime.toJSON()` produces RFC 9557 (`2026-08-10T09:00:00+02:00[Europe/Madrid]`), which is **not** a valid RFC 3339 `date-time`, and `PlainTime` / `PlainDateTime` / `PlainYearMonth` carry no offset where the registered formats require one. Claiming `format: "date-time"` for those would be a false statement about the wire, and a standard validator that checks formats would reject valid data.

### Values that travel as a container

| `jsType` | Wire schema | Decodes to |
| --- | --- | --- |
| `Map` | `{"type": "array", "items": {"type": "array", "prefixItems": [K, V], "items": false, "minItems": 2}}` | `Map<K, V>` |
| `Set` | `{"type": "array", "items": V, "uniqueItems": true}` | `Set<V>` |

The type arguments are read out of the wire schema itself: a `Map`'s key and value are `prefixItems[0]` and `prefixItems[1]`, a `Set`'s item is `items`. There is no separate argument list, because the wire schema already had to say the same thing to be honest about the JSON.

### The absent values

| `jsType` | Wire schema | Decodes to |
| --- | --- | --- |
| `undefined` | `{"type": "null"}` | `undefined` |
| `void` | `{"type": "null"}` | `void` |
| `Promise` | the resolved value's schema | `Promise<T>` |

`undefined` and `void` are not "no wire form": they encode as JSON `null`, in an object member and in an array slot alike. Only at the top level of a document does the encoder produce the JavaScript value `undefined`, because a bare `undefined` is not a JSON document at all, and a schema is not a document position.

This is why they need a `jsType` rather than being written as plain `{"type": "null"}`: on the wire they are indistinguishable from `null`, and only the annotation says which of the three the decoded value is.

### `symbol` has no schema

A `symbol` cannot be encoded. Its identity is the symbol itself, and nothing survives a round trip through JSON, so the serialiser refuses the kind outright rather than inventing a placeholder.

There is therefore no `jsType: "symbol"`. A symbol-keyed or symbol-valued member is dropped before a schema is ever produced, which is the same thing the validate contract does.

### The two broad types

| `jsType` | Wire schema | Decodes to |
| --- | --- | --- |
| `any` | *(none, so every value)* | `any` |
| `object` | `{"type": ["object", "array"]}` | `object` |

`object` names the TypeScript `object` keyword, the non-primitive gate. It admits arrays, which is why its wire form is the two-member type union rather than `{"type": "object"}`. It is a different type from a schema with no keywords, which describes an ordinary open object.

---

## `rtFormat` and `rtFormatParams`

`format` in 2020-12 names a well-known string shape from a fixed registry. `rtFormat` names a **type-format family**: a base type plus a named, parameterised constraint set that the decoded value carries as part of its type.

```json
{"type": "string", "format": "email", "rtFormat": "email"}
```

Where the standard registry already has the right word, both keywords appear and agree. The pair is not redundant: `format` tells a standard validator what to check, `rtFormat` tells a RunTypes reader which *family* the value belongs to, and two families can share one `format`.

```json
{"type": "string", "minLength": 3, "rtFormat": "stringFormat"}
{"type": "string", "minLength": 3, "format": "email", "rtFormat": "email"}
```

Both accept strings of at least three characters. They decode to different types, and only `rtFormat` says which.

### Parameters

A family's parameters go on the **standard keyword** whenever one exists. This is what keeps a standard validator enforcing them:

| Parameter | Standard keyword |
| --- | --- |
| `minLength` / `maxLength` | `minLength` / `maxLength` |
| `pattern` | `pattern` |
| `min` / `max` | `minimum` / `maximum` |
| `gt` / `lt` | `exclusiveMinimum` / `exclusiveMaximum` |
| `multipleOf` | `multipleOf` |
| `minItems` / `maxItems` / `uniqueItems` | same |
| `minProperties` / `maxProperties` | same |

`rtFormatParams` carries only what is left: parameters the standard has no keyword for, and parameters whose value the standard keyword cannot round-trip.

```json
{"type": "string", "format": "email", "rtFormat": "email", "rtFormatParams": {"localPart": {"maxLength": 64}}}
```

Two cases make `rtFormatParams` load-bearing rather than decorative:

**Bigint bounds.** A `bigint` family's `min`/`max` are bigints, and JSON has no bigint. They ride as decimal strings:

```json
{"type": "string", "pattern": "^-?[0-9]+$", "jsType": "bigint",
 "rtFormat": "bigintFormat", "rtFormatParams": {"min": "0", "max": "18446744073709551615"}}
```

**A parameter sitting at the standard keyword's default.** `{"minItems": 0}` says exactly what omitting `minItems` says, so a reader cannot tell the two apart, and the family's parameter would be lost. It goes in `rtFormatParams` instead, leaving the standard keyword's meaning untouched:

```json
{"type": "array", "items": {"type": "string"}, "rtFormat": "formattedArray", "rtFormatParams": {"minItems": 0}}
```

Parameters that only affect mock generation or input transformation (`mockSamples`, `trim`, `lowercase`) have no schema counterpart in either place. They do not describe what a validator enforces, so putting them in a schema would misrepresent it.

---

## `tsLabels`

Tuple slot names, one per slot in order, the rest slot included. Extends `prefixItems`.

```json
{"type": "array", "prefixItems": [{"type": "number"}, {"type": "number"}],
 "minItems": 2, "items": false, "tsLabels": ["x", "y"]}
```

Decodes to `[x: number, y: number]`. Slot names are part of a tuple's identity in TypeScript, so a labelled tuple and an unlabelled one are different types even though no JSON value can tell them apart.

The list MUST cover every slot or it is ignored whole. A partial list would silently produce a tuple with some slots named, which TypeScript cannot express.

---

## `tsReadonly`

The members carrying the `readonly` modifier, named the way `required` names its own. Extends `required`.

```json
{"type": "object", "properties": {"id": {"type": "string"}, "hits": {"type": "number"}},
 "required": ["id", "hits"], "tsReadonly": ["id"]}
```

Decodes to `{readonly id: string; hits: number}`.

This is **not** the standard `readOnly` keyword, which is an annotation about write access to a resource and constrains nothing. The two can coexist and mean different things.

---

## `tsIndexes`

Index signatures whose key `additionalProperties` cannot describe, one entry per signature. Extends `additionalProperties`.

```json
{"type": "object", "tsIndexes": [{"key": {"type": "number"}, "value": {"type": "string"}}]}
```

Decodes to `{[key: number]: string}`.

`additionalProperties` speaks about string keys only, and about all of them at once. It stays the right keyword for `{[key: string]: V}`. `tsIndexes` covers numeric keys, symbol keys, pattern keys (a `key` schema carrying `tsTemplate`), and shapes with more than one signature.

Because JSON object keys are always strings on the wire, a numeric or pattern key does constrain the JSON, and the wire half of that constraint SHOULD also be written with `patternProperties` or `propertyNames` where it can be.

---

## `tsTemplate`

The parts of a template literal type: `texts` holds the n+1 literal chunks, `placeholders` the n schemas between them. Extends `pattern`.

```json
{"type": "string", "pattern": "^api/[^/]*/v[0-9]+$",
 "tsTemplate": {"texts": ["api/", "/v", ""], "placeholders": [{"type": "string"}, {"type": "number"}]}}
```

Decodes to `` `api/${string}/v${number}` ``.

The pattern and the parts say the same thing to two different audiences. A pattern alone cannot rebuild the type, because reading a regular expression back into a template literal type is not decidable; the parts can, and a standard validator still gets a real constraint from the pattern.

Only placeholders that TypeScript can interpolate appear here: `string`, `number`, `bigint`, and literal values. A literal placeholder is normally folded into the neighbouring text by the type checker before it is ever written down.

---

## `tsFunction`

A function signature. `params` is an ordinary tuple schema, `return` an ordinary schema.

```json
{"tsFunction": {
  "params": {"type": "array", "prefixItems": [{"type": "string"}], "minItems": 1, "items": false, "tsLabels": ["message"]},
  "return": {"type": "boolean"}}}
```

Decodes to `(message: string) => boolean`.

Functions have no wire form, so there is no `type` beside it. Using a tuple schema for the parameters means optional slots, a rest slot and the parameter names all come from keywords that already exist.

---

## `tsMeta`

A `base & {…}` metadata intersection: the base schema beside the metadata objects conjoined onto it.

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
2. MUST NOT let any extension keyword change a validation verdict.
3. SHOULD reject an extension keyword whose sibling wire keywords contradict it (`{"type": "number", "jsType": "Date"}` is not meaningful, since a `Date` travels as a string).
4. MAY ignore any extension keyword it does not implement, and MUST fall back to the wire type when it does.
5. MUST treat every `ts`-prefixed keyword as droppable: stripping all of them leaves a document that validates identically and describes the same JSON.

A **portable** document is one using no extension keyword at all. Producers should offer a mode that emits only portable documents and reports an error where a type cannot be expressed without the extension, so a schema destined for a non-RunTypes consumer never silently depends on it.

## Relationship to RunTypes

RunTypes reads this dialect through `runTypeFromJsonSchema` and writes it with `ts-runtypes convert --to json-schema`. The `--portable` flag is the portable mode described above.

The keyword-to-lowering table is machine-checked in
`packages/ts-runtypes/src/json-schema/fromJsonSchema.ts` (`SchemaLoweringByKeyword`): every accepted keyword has a row, and a keyword without one fails to compile. That table and this document describe the same thing, so a change to either without the other is a bug.
