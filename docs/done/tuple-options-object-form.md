---
type: feature
spec: guidelines
status: done
created: 2026-08-09
completed: 2026-08-16
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

> **Superseded on the "which stay" clause.** The group form REPLACED the
> positional spelling outright rather than sitting beside it — see
> *What shipped* at the bottom for the decision and its consequences. The rest
> of this section still describes the feature accurately.

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

---

## What shipped — group form, positional removed (2026-08-16)

The feature landed as specified, with one deliberate widening decided during
implementation: **the positional spelling was REMOVED, not kept.** The goal the
requester stated is that a tuple or function definition be unambiguous on its
face — a bare `RT.tuple([a, b])` gives the reader no hint about which elements
are optional, and two spellings for one shape reintroduces exactly that
ambiguity. So the group form is now the only way in.

### The surface

    RT.tuple({required: [...], optional: [...], rest: slot})   // every key optional
    RT.func({params: [...], ret: r})                           // every key optional

`RT.tuple({})` is the empty tuple, `RT.func()` and `RT.func({ret: r})` are the
no-params signatures. `func` got the same treatment as `tuple` (the requester's
call), but only as a re-spelling: optional and rest PARAMETERS still ride the
params-tuple form (`RT.func({params: RT.tuple({...}), ret})`), which the
`Explicitly NOT this` section's reasoning still governs.

### Two overloads, not eight — and no `infer`

The obvious encodings were measured against each other before choosing
(360 call sites, repo TypeScript 6.0.3, `tsc --extendedDiagnostics`):

| design | overloads | instantiations | types | rejects bad calls |
| --- | --- | --- | --- | --- |
| positional (what this replaced) | 7 | 14,555 | 6,036 | — |
| one per shape per family | 8 | 12,616 | 8,855 | yes |
| one overload + conditional `infer` | 1 | 22,992 | 5,862 | **NO** |
| **one per family + presence check** | **2** | **13,858** | **6,883** | **yes** |

The `infer` encoding lost on both axes. It costs ~58% more instantiations, and
worse, it is UNSOUND for this surface: collapsing the family choice into a
conditional makes the bag its own inferred type, so nothing is ever "excess" —
unknown keys, typo'd keys and mixed labeled/unlabeled groups all compiled
silently and branded a garbage type. That is recorded in `static.ts` beside the
group types so it is not re-attempted.

The shipped encoding is one overload per FAMILY (plain run-types, slot
carriers). An absent `rest` group leaves its type parameter with no inference
site, so it lands on a `never` default and a single non-distributive
`[Rest] extends [never]` picks the shape — no `infer` anywhere, and cheaper
than the positional ladder it replaced. Types: `TupleFromGroups` /
`LabeledTupleFromGroups` / `FuncFromParams` in `builders/static.ts`.

### Id identity

Pinned exactly, which is the whole point — no cache entry moved:

- 33 `Exact<>` assertions across all 9 shapes, verified against the positional
  form's brand before it was deleted.
- `labeledSlots.test.ts` — group form vs type-first, BOTH `getRunTypeId` call
  shapes, including the shape the positional form could only spell with an empty
  `[]` (`{required, rest}`), the empty bag, and the nested un-injected carrier.
- `labeled_builders_test.go` — the authoritative tsgo gate:
  `TestTupleGroups_OmittedGroupsMatchTheirEmptySpelling`,
  `TestTupleGroups_EmptyBagConvergesWithTheEmptyTuple`,
  `TestLabeledFunc_OmittedParamsGroupConvergesWithNoParams`.
- `typesafety.test.ts` — 8 `@ts-expect-error` pins: unknown key, typo'd key,
  mixed families across groups, mixed within one group, array as `rest`, and
  both positional spellings now failing to compile.

### Consequences beyond the builder

- **Printer**: `internal/convert/printbuilder.go` emits the group form for every
  tuple and function, printing only the groups a shape actually has. The
  empty-`[]`-before-rest ceremony is gone from generated code.
- **Migration**: 222 call sites rewritten (147 tuple, 75 func) across 24 TS
  files plus the Go fixtures and printer pins. `isInjectedId` and the
  `isEntryTuple` import were deleted from `compose.ts` — the group form reads
  its groups by name, so there is no trailing-slot probing left to disambiguate.
- **Breaking change**: this is a public builder-surface break. Pre-1.0, and the
  positional spelling has no remaining users in-tree.

### Fuzzing

A dedicated spelling-equivalence suite was scoped and then deliberately NOT
built. Its premise was comparing the two spellings, and removing the positional
one deleted that oracle. What replaced it: now that the printer emits the group
form, the existing `convertcli` lane already IS this fuzz — it generates random
types across the full type space, prints group-form builders through the real
binary, and asserts every structural id survives every leg. That was verified by
negative control: breaking the group emission by one character turned the lane
red with an id-drift report and a replay seed. The only shapes it cannot reach
are hand-authored spellings the printer never emits (omitted vs explicitly-empty
groups), which are enumerable and pinned in the Vitest and Go tests above.
