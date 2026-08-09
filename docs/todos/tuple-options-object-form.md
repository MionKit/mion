---
type: feature
spec: guidelines
status: ready
created: 2026-08-09
---

# `RT.tuple` / `RT.func`: an options-object form for the slot groups

## Problem

`tuple` groups its slots POSITIONALLY: required array, optional array, rest
([packages/ts-runtypes/src/builders/compose.ts:132-196](../../packages/ts-runtypes/src/builders/compose.ts)).

    RT.tuple([slot('x', n)])                        // [x: number]
    RT.tuple([slot('x', n)], [slot('y', s)])        // [x: number, y?: string]
    RT.tuple([slot('x', n)], [], slot('rest', s))   // [x: number, ...rest: string[]]

Two readability problems, both reported from a real reading of the code:

1. With ONE slot per group the nesting reads like a mistake —
   `RT.tuple([slot('head', n)], [slot('tail', self())])` looks like each slot
   was wrapped in its own array, rather than "one required group, one optional
   group".
2. Reaching the rest slot requires passing an empty `[]` for the optional
   group, which is pure ceremony.

## Direction

Add an options-object overload beside the positional ones (which stay — they
are used across the suites and in generated convert output):

    RT.tuple({required: [slot('x', n)], optional: [slot('y', s)], rest: slot('items', s)})

Every key optional; the recovered type must be IDENTICAL to the positional
form's (same `LabeledTuple` / `LabeledRestTuple` machinery, just a different
way in), so the structural id is unchanged and no cache entry moves. The same
question applies to `func`'s parameter groups — decide whether it takes the
same treatment in the same change or stays positional.

Worth settling while implementing:

- Runtime disambiguation: the first argument is an ARRAY in the positional
  forms and a plain object here, so `Array.isArray` separates them — but the
  injected-id probe (`isInjectedId`) already inspects trailing arguments, so
  check the options object cannot be mistaken for one.
- Whether the convert printer should EMIT the new form (a readability win in
  generated code) or keep the positional spelling. If it switches, the
  convert chain tests and the roundtrip fuzz lane's expectations move with it.
- Docs: the tuple section of the type-builders guide and any
  `packages/examples/src/` file using the positional form.

## Explicitly NOT this

Inline per-slot optionality (`RT.tuple([slot('x', n), optional(slot('y', s))])`)
stays rejected. TypeScript can only make a TRAILING GROUP of tuple slots
optional (`Partial` over the tail); recovering `[x: number, y?: string]` from
one mixed array needs the type machinery to split the list at the first
optional slot and rebuild both halves, which means recursive `infer` in the
builder surface — the thing this repo avoids for checker cost. The grouping
is a type-system constraint; only its SPELLING is up for improvement.

## Done when

`RT.tuple({required, optional, rest})` builds every shape the positional form
builds, pinned id-identical to both the positional spelling and the type-first
labeled tuple (both marker call shapes), the positional overloads still work,
and the docs show the new form.
