---
type: fix
spec: guidelines
status: done
created: 2026-08-09
---

# A JSON Schema authored with `tsLabels` cannot be converted to a type

> Filed as `jsLabels`; the keyword was renamed to `tsLabels` when
> `docs/json-schema-2020-12-javascript.md` landed. The defect is unchanged.

## Problem

A schema written BY HAND with the `tsLabels` dialect keyword refused on both
value targets, reporting a symbol-keyed member the author never wrote:

    export const xRT = runTypeFromJsonSchema({
      type: 'array',
      prefixItems: [{type: 'number'}],
      tsLabels: ['x'],
    } as const);
    export type X = InferType<typeof xRT>;

    $ ts-runtypes convert --to type src/main.ts
    src/main.ts: CNV001 error [X]: symbol-keyed member "\xfe@iterator" is not convertible yet

## What it actually was — a LABEL COUNT mismatch, not the keyword

The filed guess was that the labeled tuple reached the printer's object branch.
That is the symptom; the trigger is narrower. Probing the shape against every
combination showed the split cleanly:

| schema | converts |
| --- | --- |
| `prefixItems:[n], minItems:1, items:false, tsLabels:['x']` | yes → `[x: number]` |
| `prefixItems:[n], items:{string}, tsLabels:['x','rest']` | yes → `[x?: number, ...rest: string[]]` |
| `prefixItems:[n], tsLabels:['x']` | **refused** |
| `prefixItems:[n], minItems:1, tsLabels:['x']` | **refused** |
| `prefixItems:[n], items:{string}, tsLabels:['x']` | **refused** |
| `prefixItems:[n], minItems:1, items:false, tsLabels:['x','extra']` | **refused** |

The rule is the one the dialect spec already states under `TS-LABELS`: the list
"MUST cover every slot or it is ignored whole", the rest slot included. An open
`prefixItems` with no `items` keyword has TWO positions (the prefix element and
the `unknown[]` rest), so a single label does not cover it. Every refusing row
is a count mismatch; every passing row covers exactly.

So the schema in the original report converts to `[number?, ...unknown[]]` — the
labels IGNORED — and not to `[x: number]` as the Done-when guessed. `[x: number]`
needs the closed spelling (`minItems: 1, items: false`), which always worked.

## The one-token divergence

`internal/cachegen/runtype/intersection_collapse.go` collapses
`tuple ∧ {__rtLabels?: [...]}`. The covering case projects the tuple with its
labels; a mismatch falls through to the single-base branch, whose guard listed
every OTHER sentinel but not the labels one:

    if restCount == 1 &&
        (len(node.Negations) > 0 || node.FormatAnnotation != nil || … ) {

A labels-ONLY carrier has no other sentinel to hold that guard open, so it fell
past it into the merged-property path — which surfaced the tuple's Array
interface as an object literal, hence `\xfe@iterator`.

The typeid twin in `typeid/intersection_collapse.go` already had
`haveTupleLabels` in the same guard and was hashing the plain tuple. So the id
said "tuple" while the projection said "object": id ≠ behaviour, which the
pipeline promises never to do. The fix adds the missing term.

## Also fixed by this: the lane's blind spot

The roundtrip fuzz lane only converts schemas the CONVERTER wrote, and the
converter always writes an exact label count — which is why nothing ever fed a
mismatch back in. `ts-go-runtypes/internal/convert/handauthored_test.go` closes
that: one hand-written schema per keyword in the dialect's summary table, plus
the structural core keywords (`not`, `contains`, `patternProperties`,
`propertyNames`, `minProperties`, `oneOf`, `$ref: '#'`,
`unevaluatedProperties`), each converted on both value targets under the id
oracle.

That coverage immediately found two more defects, both filed rather than fixed
(each needs a design decision this change should not make alone):

- [convert-drops-unevaluated.md](convert-drops-unevaluated.md) —
  `unevaluatedProperties` is dropped silently, no keyword and no diagnostic.
- [propertynames-non-string-key-schema.md](propertynames-non-string-key-schema.md)
  — a TYPELESS `propertyNames` subschema lowers to a JSON-value union the
  value-first builder's params type cannot carry, so the emitted builders code
  does not compile and the constraint evaporates.

Both rows stay listed in the new test, skipped with a pointer to their spec, so
the gaps are visible rather than absent.

## Not a regression, but newly loud

Before the symbol-key guard was corrected (it only matched the `@@name`
spelling, missing tsgo's `\xFE@…` one), this same shape CONVERTED — and printed
the mangled internal spelling as an ordinary string property:

    export type X = {'�@iterator': …};

So the underlying defect predates the guard; the guard turned silent corruption
into a loud refusal. That is the better failure mode, and it is why this was
filed rather than reverted.

## Done when (met, with one correction)

A hand-authored `tsLabels` schema converts on both targets: with the labels when
the list covers every slot, and ignored whole when it does not — never a
refusal, and never some-slots-named, which TypeScript cannot express. The
several-slot, optional-slot, over-long and under-long counts are all pinned by
`TestHandAuthored_TsLabelsCountMismatch`, and the roundtrip coverage now
includes a hand-authored schema per door keyword.

The original Done-when expected `[x: number]` for the open schema; per
`TS-LABELS` that list does not cover the rest slot, so the correct outcome is
the unlabeled tuple.
