---
type: fix
spec: guidelines
status: ready
created: 2026-08-09
---

# A JSON Schema authored with `tsLabels` cannot be converted to a type

> Filed as `jsLabels`; the keyword was renamed to `tsLabels` when
> `docs/json-schema-2020-12-javascript.md` landed. The defect is unchanged.

## Problem

A schema written BY HAND with the `tsLabels` dialect keyword refuses on the
type target, reporting a symbol-keyed member that the author never wrote:

    export const xRT = runTypeFromJsonSchema({
      type: 'array',
      prefixItems: [{type: 'number'}],
      tsLabels: ['x'],
    } as const);
    export type X = InferType<typeof xRT>;

    $ ts-runtypes convert --to type src/main.ts
    src/main.ts: CNV001 error [X]: symbol-keyed member "\xfe@iterator" is not convertible yet

Reproduces with two slots as well, so it is not an arity edge. `Symbol.iterator`
is an ARRAY member: the labeled tuple the door lowers to is reaching the
printer's OBJECT branch and having its array members walked as if they were
data properties, instead of being recognised as a tuple.

## Not a regression, but newly loud

Before the symbol-key guard was corrected (it only matched the `@@name`
spelling, missing tsgo's `\xFE@…` one), this same shape CONVERTED — and printed
the mangled internal spelling as an ordinary string property:

    export type X = {'�@iterator': …};

So the underlying defect predates the guard; the guard turned silent corruption
into a loud refusal. That is the better failure mode, and it is why this is
filed rather than reverted.

## What works, for contrast

- Type-first `[x: number]` → schema → type: fine, pinned by
  `TestChain_LabeledTuple` and the roundtrip fuzz lane (which is why this
  escaped both — the lane only ever converts schemas the converter itself
  wrote).
- Every other door keyword authored by hand converts to a type cleanly:
  `propertyNames`, `not`, `contains`, `patternProperties`, `$ref: '#'`,
  `oneOf`, `minProperties` were each checked individually.

## Fix directions to evaluate

- Find why the door's `tsLabels` lowering lands in the object branch when the
  type-first labeled tuple does not. The likely suspect is the collapse: the
  `__rtLabels` intersection is lifted for one spelling but left as a plain
  intersection member for the other, so the node arrives as an object with an
  array base rather than as `KindTuple`.
- Whatever ships must also add the hand-authored direction to the roundtrip
  coverage. The lane's blind spot is real and general: it only round-trips
  converter-written schemas, so any door keyword a user can write but the
  converter never emits is untested on the way back.

## Done when

The schema above converts to `export type X = [x: number];`, the same holds
with several slots and with an optional slot, and the roundtrip coverage
includes at least one HAND-authored schema per door keyword.
