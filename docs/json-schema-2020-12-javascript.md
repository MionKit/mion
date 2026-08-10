# JSON Schema 2020-12 JavaScript

A small, conservative extension to [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12) that records **what the validated JSON becomes in JavaScript**.

Status: specification. Version 1. Keyword prefix `js`.

## Why

JSON Schema describes JSON. JavaScript has types JSON has no word for: `bigint`, `Date`, `Map`, `Set`, `RegExp`, Temporal values, template literal types, functions, the `readonly` modifier. Those types still travel over the wire perfectly well, they just travel *as* something else. A `Date` travels as an ISO string. A `bigint` travels as a decimal string. A `Map` travels as an array of pairs.

Standard JSON Schema can describe the string and the array. What it cannot say is that the string should come back as a `Date`.

This extension adds that second half. It never replaces the first.

## The one rule

> **Deleting every `js*` keyword from a document must not change whether any JSON value validates against it.**

That is the whole design, and everything below follows from it.

A document in this dialect is a valid 2020-12 document. Draft 2020-12 requires an implementation to ignore keywords it does not recognise, so any standard validator reads one of these schemas, ignores the `js*` keywords, and enforces exactly the wire contract. Nothing is weakened and nothing is skipped.

A reader that *does* understand the extension gets one more thing: the JavaScript type on the other side of the decode.

```json
{"type": "string", "format": "date-time", "jsType": "Date"}
```

Every validator agrees this accepts `"2026-08-10T09:00:00Z"` and rejects `42`. A RunTypes-aware reader also knows the decoded value is a `Date`, not a `string`.

## What this is not

- **Not a replacement for `type`.** `jsType` sits *beside* `type`, never instead of it. A schema whose only kind information is a `js*` keyword is not conforming.
- **Not a second validation vocabulary.** No `js*` keyword narrows, widens or overrides an assertion. They are annotations in the 2020-12 sense.
- **Not a serialisation format.** It describes JSON that already exists; it does not prescribe how a value is encoded, only what the encoding means.

## Identification

The dialect is identified by the meta-schema URI:

```
https://runtypes.pages.dev/schema/2020-12-javascript
```

A document MAY declare it with `$schema`. A document that declares plain `https://json-schema.org/draft/2020-12/schema` and uses `js*` keywords is still conforming, because by the one rule above the keywords are inert to a plain 2020-12 reader. Declaring the dialect URI is a signal to tooling, not a requirement for correctness.

## Keyword summary

| Keyword | Extends | Carries |
| --- | --- | --- |
| `jsType` | `type` | the JavaScript type the wire form decodes to |
| `jsFormat` | `format` | the named type-format family the value belongs to |
| `jsFormatParams` | the constraint keywords | family parameters that have no standard keyword |
| `jsLabels` | `prefixItems` | tuple slot names |
| `jsReadonly` | `required` | the members that are `readonly` |
| `jsIndexes` | `additionalProperties` | index signatures whose key is not a plain string |
| `jsTemplate` | `pattern` | the parts of a template literal type |
| `jsFunction` | nothing standard | a function signature |
| `jsNot` | nothing standard | negation of a single format, keeping its base type |
| `jsMeta` | nothing standard | a `base & {…}` metadata intersection |

Every one is optional. A document using none of them is ordinary JSON Schema.

---

## `jsType`

Names the JavaScript type the validated wire form decodes to. Always a sibling of the `type` (and, where one applies, `format`) that describes the wire.

### Values that travel as a string

| `jsType` | Wire schema | Decodes to |
| --- | --- | --- |
| `bigint` | `{"type": "string", "pattern": "^-?[0-9]+$"}` | `bigint` |
| `Date` | `{"type": "string", "format": "date-time"}` | `Date` |
| `RegExp` | `{"type": "string"}` | `RegExp` |
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

### Values with no wire form

| `jsType` | Wire schema | Decodes to |
| --- | --- | --- |
| `undefined` | *(none)* | `undefined` |
| `void` | *(none)* | `void` |
| `symbol` | *(none)* | `symbol` |
| `Promise` | the resolved value's schema | `Promise<T>` |

These describe members that do not survive serialisation. They appear so a schema can round-trip back to the exact TypeScript type it came from, and a member carrying one is dropped from the wire, not encoded as `null`.

### The two broad types

| `jsType` | Wire schema | Decodes to |
| --- | --- | --- |
| `any` | *(none, so every value)* | `any` |
| `object` | `{"type": ["object", "array"]}` | `object` |

`object` names the TypeScript `object` keyword, the non-primitive gate. It admits arrays, which is why its wire form is the two-member type union rather than `{"type": "object"}`. It is a different type from a schema with no keywords, which describes an ordinary open object.

---

## `jsFormat` and `jsFormatParams`

`format` in 2020-12 names a well-known string shape from a fixed registry. `jsFormat` names a **type-format family**: a base type plus a named, parameterised constraint set that the decoded value carries as part of its type.

```json
{"type": "string", "format": "email", "jsFormat": "email"}
```

Where the standard registry already has the right word, both keywords appear and agree. The pair is not redundant: `format` tells a standard validator what to check, `jsFormat` tells a RunTypes reader which *family* the value belongs to, and two families can share one `format`.

```json
{"type": "string", "minLength": 3, "jsFormat": "stringFormat"}
{"type": "string", "minLength": 3, "format": "email", "jsFormat": "email"}
```

Both accept strings of at least three characters. They decode to different types, and only `jsFormat` says which.

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

`jsFormatParams` carries only what is left: parameters the standard has no keyword for, and parameters whose value the standard keyword cannot round-trip.

```json
{"type": "string", "format": "email", "jsFormat": "email", "jsFormatParams": {"localPart": {"maxLength": 64}}}
```

Two cases make `jsFormatParams` load-bearing rather than decorative:

**Bigint bounds.** A `bigint` family's `min`/`max` are bigints, and JSON has no bigint. They ride as decimal strings:

```json
{"type": "string", "pattern": "^-?[0-9]+$", "jsType": "bigint",
 "jsFormat": "bigintFormat", "jsFormatParams": {"min": "0", "max": "18446744073709551615"}}
```

**A parameter sitting at the standard keyword's default.** `{"minItems": 0}` says exactly what omitting `minItems` says, so a reader cannot tell the two apart, and the family's parameter would be lost. It goes in `jsFormatParams` instead, leaving the standard keyword's meaning untouched:

```json
{"type": "array", "items": {"type": "string"}, "jsFormat": "formattedArray", "jsFormatParams": {"minItems": 0}}
```

Parameters that only affect mock generation or input transformation (`mockSamples`, `trim`, `lowercase`) have no schema counterpart in either place. They do not describe what a validator enforces, so putting them in a schema would misrepresent it.

---

## `jsLabels`

Tuple slot names, one per slot in order, the rest slot included. Extends `prefixItems`.

```json
{"type": "array", "prefixItems": [{"type": "number"}, {"type": "number"}],
 "minItems": 2, "items": false, "jsLabels": ["x", "y"]}
```

Decodes to `[x: number, y: number]`. Slot names are part of a tuple's identity in TypeScript, so a labelled tuple and an unlabelled one are different types even though no JSON value can tell them apart.

The list MUST cover every slot or it is ignored whole. A partial list would silently produce a tuple with some slots named, which TypeScript cannot express.

---

## `jsReadonly`

The members carrying the `readonly` modifier, named the way `required` names its own. Extends `required`.

```json
{"type": "object", "properties": {"id": {"type": "string"}, "hits": {"type": "number"}},
 "required": ["id", "hits"], "jsReadonly": ["id"]}
```

Decodes to `{readonly id: string; hits: number}`.

This is **not** the standard `readOnly` keyword, which is an annotation about write access to a resource and constrains nothing. The two can coexist and mean different things.

---

## `jsIndexes`

Index signatures whose key `additionalProperties` cannot describe, one entry per signature. Extends `additionalProperties`.

```json
{"type": "object", "jsIndexes": [{"key": {"type": "number"}, "value": {"type": "string"}}]}
```

Decodes to `{[key: number]: string}`.

`additionalProperties` speaks about string keys only, and about all of them at once. It stays the right keyword for `{[key: string]: V}`. `jsIndexes` covers numeric keys, symbol keys, pattern keys (a `key` schema carrying `jsTemplate`), and shapes with more than one signature.

Because JSON object keys are always strings on the wire, a numeric or pattern key does constrain the JSON, and the wire half of that constraint SHOULD also be written with `patternProperties` or `propertyNames` where it can be.

---

## `jsTemplate`

The parts of a template literal type: `texts` holds the n+1 literal chunks, `placeholders` the n schemas between them. Extends `pattern`.

```json
{"type": "string", "pattern": "^api/[^/]*/v[0-9]+$",
 "jsTemplate": {"texts": ["api/", "/v", ""], "placeholders": [{"type": "string"}, {"type": "number"}]}}
```

Decodes to `` `api/${string}/v${number}` ``.

The pattern and the parts say the same thing to two different audiences. A pattern alone cannot rebuild the type, because reading a regular expression back into a template literal type is not decidable; the parts can, and a standard validator still gets a real constraint from the pattern.

Only placeholders that TypeScript can interpolate appear here: `string`, `number`, `bigint`, and literal values. A literal placeholder is normally folded into the neighbouring text by the type checker before it is ever written down.

---

## `jsFunction`

A function signature. `params` is an ordinary tuple schema, `return` an ordinary schema.

```json
{"jsFunction": {
  "params": {"type": "array", "prefixItems": [{"type": "string"}], "minItems": 1, "items": false, "jsLabels": ["message"]},
  "return": {"type": "boolean"}}}
```

Decodes to `(message: string) => boolean`.

Functions have no wire form, so there is no `type` beside it. Using a tuple schema for the parameters means optional slots, a rest slot and the parameter names all come from keywords that already exist.

---

## `jsNot`

Negation of a single named format, keeping its base type.

```json
{"type": "string", "jsNot": {"jsFormat": "email"}}
```

Decodes to "a string that is not an email address".

This is a different operation from the standard `not`, which negates a whole schema across all six JSON kinds. `{"type": "number", "not": {…}}` under standard semantics is the complement within the number kind; `jsNot` negates one format and keeps its base. Both keywords may appear; they compose as written.

---

## `jsMeta`

A `base & {…}` metadata intersection: the base schema beside the metadata objects conjoined onto it.

```json
{"jsMeta": {
  "base": {"type": "string"},
  "meta": [{"type": "object", "properties": {"__brand": {"const": "UserId"}}, "required": ["__brand"], "jsReadonly": ["__brand"]}]}}
```

Decodes to `string & {readonly __brand: 'UserId'}`, the usual way a nominal brand is written in TypeScript.

The base is nested under the keyword rather than sitting beside it because a base may itself carry a `js*` discriminator, and those are read first.

Only the base describes the wire. The metadata objects are phantom: they exist in the type and never in the JSON, which is why the wire contract of a `jsMeta` schema is exactly the wire contract of its base.

---

## Conformance

An implementation of this dialect:

1. MUST validate the document as draft 2020-12, ignoring the `js*` keywords for that purpose.
2. MUST NOT let any `js*` keyword change a validation verdict.
3. SHOULD reject a `js*` keyword whose sibling wire keywords contradict it (`{"type": "number", "jsType": "Date"}` is not meaningful, since a `Date` travels as a string).
4. MAY ignore any `js*` keyword it does not implement, and MUST fall back to the wire type when it does.

A **portable** document is one using no `js*` keyword at all. Producers should offer a mode that emits only portable documents and reports an error where a type cannot be expressed without the extension, so a schema destined for a non-RunTypes consumer never silently depends on it.

## Relationship to RunTypes

RunTypes reads this dialect through `runTypeFromJsonSchema` and writes it with `ts-runtypes convert --to json-schema`. The `--portable` flag is the portable mode described above.

The keyword-to-lowering table is machine-checked in
`packages/ts-runtypes/src/json-schema/fromJsonSchema.ts` (`SchemaLoweringByKeyword`): every accepted keyword has a row, and a keyword without one fails to compile. That table and this document describe the same thing, so a change to either without the other is a bug.
