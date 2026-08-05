---
type: feature
spec: guidelines
status: done
completed: 2026-08-05
created: 2026-08-05
---

# The two keyword-first items that did not ship: a shared negation slot, and collapsing the jsonContent format

Split out of
[json-schema-keyword-first-formats.md](../done/json-schema-keyword-first-formats.md)
(now in `docs/done/`). Everything else in that spec shipped; these two are
independent of it and of each other, so they stand alone rather than holding a
finished spec open.

## 1. A shared `NotSlot<Child>` so the schema translation stops spelling `__rtNot` raw

`fromJsonSchema.ts` writes the negation sentinel inline at 5 sites:

```ts
GateArmFrom<K, S, Root, F> & {readonly [__rtNot]?: NotChildFor<K, NS, Root, F>}
```

That is the last raw sentinel spelling left in the file, and the reason it is
still there is real: the public `Not<F>` accepts only PRIMITIVE operands
(`NotableFormat` plus `ValidNotOperand`, which key on inferring a format-name
literal), while the translation negates general gate arms — objects, arrays,
unions, literal verdicts.

**Fix:** add a `NotSlot<Child>` to `formats/not.ts` carrying the sentinel with no
operand constraint, and express the public `Not<F>` in terms of it. The
translation then imports `NotSlot` and the raw spelling goes.

Keep in mind:

- the surrounding negation LOGIC (`GateArmFrom`, `NotChildFor`, the kind
  complement) is genuine schema mapping and stays where it is;
- `Not<F>`'s operand constraint is what makes `Not<Not<F>>` and mixed-base unions
  fail AT the write site — moving the sentinel out must not weaken it;
- the encoding is byte-pinned by the convergence suites, so a change here shows
  up as an id split rather than a type error. Gate on the json-schema fuzz.

Small, and self-contained.

## 2. Collapse the `jsonContent` FORMAT into `StringParams`

`jsonContent` is still a registered Go format of its own. The keyword-first rule
says `contentMediaType` / `contentEncoding` should be ordinary `StringParams`
entries, with the JSON-parse check absorbed into the `stringFormat` emitter.

Scope:

- delete `jsoncontent.go` and its registration; move its parse check into the
  stringFormat emitter, keyed on the new params;
- move the mock (`mockStringFormat.ts`) and negation (`negationMatch.ts`) arms to
  the stringFormat path;
- drop the `SchemaStoryByFormatName` row (shrinking `FormatName`, which the
  totality assert covers), and re-point `JsonContent` / `JsonContentBase64` at
  `String<{contentMediaType: …}>`;
- update `SchemaLoweringByKeyword`'s `contentMediaType` / `contentEncoding` rows,
  whose channel is asserted by
  `test/suites/json-schema-define/loweringTable.test.ts`.

**This is the riskiest Go surgery in the original spec** — deleting a registered
format changes a user-visible error payload (`FormatErrCall(… "jsonContent" …)`)
and moves every jsonContent id. The authoring gap that motivated it is already
closed (`TF.jsonContent()` exists and converges), so there is no user-facing
urgency; this is about the mapping rule being uniform.

## What shipped

**1. `NotSlot<Child>`** — added to `formats/not.ts` with no operand constraint;
`Not<F>` is now expressed through it, and the translation imports it, so all 5
raw `__rtNot` spellings are gone. `Not<F>`'s operand constraint is untouched, so
`Not<Not<F>>` and mixed-base unions still fail at the write site. Ids unchanged.

**2. The `jsonContent` format is gone.** `jsoncontent.go` deleted with its
registration; the parse check now lives in the string emitter, fired by
`contentMediaType` and decoding first when `contentEncoding` is `base64` (`atob`
throws on malformed input and the try/catch turns that into `false`, so the
decode doubles as the encoding check). `StringParams` gained `contentEncoding`
and `contentMediaType`; `JsonContent` / `JsonContentBase64` are now `String`
aliases over them; the mock and negation arms moved onto the string path; the
`SchemaStoryByFormatName` row is gone and the catalog regenerated.

The public surface is unchanged — `TF.JsonContent`, `TF.jsonContent()` and the
schema spelling all still work and still converge — so the website needed no
edit. What DID change, by explicit decision, is the validation error payload:

```
before  {name: 'jsonContent',  formatPath: ['contentMediaType'], val: 'application/json'}
after   {name: 'stringFormat', formatPath: ['contentMediaType'], val: 'application/json'}
```

which is the shape a `minLength` failure already reports. Special-casing the old
name back would have kept a `jsonContent` branch in the emitter, which is the
thing being removed.

**Caught by the fuzz:** the roundtrip suite failed on one seed after the Go
format was deleted. Its `FzJson` oracle still spelled the old encoding
(`'jsonContent'` + `{json: true}`), so a negated JSON-content leaf had nothing
left to negate and validate rejected its own generated value. The oracle now
spells `stringFormat` + `contentMediaType`. Worth recording as the failure mode
this class of change produces: a stale hand-written oracle does not error, it
silently inverts.

## Still open: the website keyword table

Deferred by decision when this landed — see
[../todos/json-schema-website-keyword-table.md](../todos/json-schema-website-keyword-table.md).
