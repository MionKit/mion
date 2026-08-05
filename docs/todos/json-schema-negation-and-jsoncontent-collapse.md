---
type: feature
spec: guidelines
status: open
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

## Also deferred: the website keyword table

The JSON Schema guide is API-TRUE (the content-keyword rows landed with the
main spec), but the 4-column keyword table and its compiled examples file under
`packages/examples/src/` were never written. Worth doing alongside item 2, since
that is what changes the content rows again.
