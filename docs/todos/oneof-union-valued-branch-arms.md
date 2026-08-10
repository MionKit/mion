---
type: fix
spec: guidelines
status: ready
created: 2026-08-10
---

# A union-valued oneOf branch still hides the arms beside it

## Problem

`OneOf<[A, B]> | C` now validates correctly: each exclusive group counts on its
own, and the arms beside it are checked like any union member (shipped with
`docs/done/oneof-not-covering-whole-union.md`).

One shape is still conservative. When a BRANCH is itself a union
(`OneOf<[A | B, C]> | D`), the arms beside the groups are ignored and `D` is
dropped — the same under-acceptance the main fix removed, just narrowed to this
one case.

## Why it was left

Coverage is computed by differencing `RunType.ID`: the members of the union
minus the members the branches account for. That is exact while every branch is
an ordinary member, and WRONG the moment a branch is a union.

TypeScript flattens a union-valued branch into the outer union, and the checker
may re-distribute an intersection while doing so, so the outer `Children` end up
holding members that belong to the branch without appearing in the branch node's
own children. Differencing ids then reports arms that are really distribution
artifacts.

That is not hypothetical. The door lowers `allOf: [A, B, {oneOf: [C, D]}]` to
`OneOf<[A∧B∧C, A∧B∧D]>`, whose two branches are unions of 69 members each while
the outer union holds 93 — 3 of which the id difference wrongly called arms.
ORing a check for them in accepted two values the exclusivity is meant to
reject, caught by `unevaluatedProperties.json :: unevaluatedProperties + ref
inside allOf / oneOf` in the official 2020-12 suite.

So the walk bails out to "everything is covered" when it sees a union-valued
branch — today's long-standing behaviour, and never worse than it.

## Fix direction

The id difference is a heuristic standing in for a fact the SERIALIZER knows for
certain: at `projectType`'s union arm
(`internal/cachegen/runtype/serialize.go`), every member is either carrier'd
(`typeid.IsOneOfCarrierMember`) or it is not, and the ones that are not are
exactly the arms beside the groups. The collapse deliberately strips the carrier
so the member serializes plain, which is why the information is gone by the time
validate looks.

Carry it instead of re-deriving it: record the plain arms on the union node (a
`OneOfRest []*RunType` beside `OneOf`, filled where the carriers are still
visible), and have `validate.go` / `validationerrors.go` /
`convert/print.go` read that rather than differencing ids. All three already
share the same walk, so all three lose the heuristic together.

Check first that distribution does not strip carriers from the members it
creates — if it does, the serializer's view is no better than the id difference
and the answer has to come from somewhere else.

## Done when

- `createValidateFn<OneOf<[A | B, C]> | D>()` accepts a `D`.
- The official-suite `unevaluatedProperties + ref inside allOf / oneOf` group
  still passes (it is the regression this guards).
- The three id-difference walks are replaced by one carried fact.
