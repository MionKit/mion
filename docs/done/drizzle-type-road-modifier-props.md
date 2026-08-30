---
type: chore
spec: guidelines
status: done
created: 2026-08-30
---

# Drizzle type road: modifiers as props (rejected), normalization cost (collected)

## What this asked for

Authoring a slim drizzle table as a TYPE cost about four times what the builder calls cost
for the identical model. An earlier spike had recorded that three quarters of that came
from one thing: unpicking the modifier marker intersections, `Varchar<'name', {length:
100}> & NotNull`. This spec proposed letting the modifiers arrive as one literal object
instead, so there would be no intersection to unpick.

It insisted, correctly, that measuring come first: "the share of the 966 this collects is
unknown, and measuring it is the first task, not the last. If the isolated change does not
move the number materially, say so and stop rather than shipping churn."

## What the measurement found

**The premise was wrong.** The 966 was a real number attached to the wrong cause. It is the
whole of normalization, not the modifier intersections. Re-measured on the current tree
(TypeScript 6.0.3, drizzle-orm 0.45.2), five columns, `InferSelectModel` consumed:

| How the table is written                              | Net instantiations |
| ----------------------------------------------------- | -----------------: |
| builder road, `pgTable('users', {...})`                |                646 |
| type road, markers intersected in                      |               1488 |
| type road, the SAME columns with NO modifiers at all   |               1301 |
| pre-branded columns, no normalization at all           |                375 |

A type-road table with zero modifiers still costs 1301 against a floor of 375. So the
modifiers are **187** of the 1113 that normalization costs, about a sixth. The proposed
change could never have collected more than that, and it would have broken the public
spelling of every column across three dialect packages, the Go convert translator, the
runtime bridge, the manifests, the docs and the examples to do it.

Prototyped anyway, against the real packages, in three shapes. All measured at or above the
marker baseline, and all made modifier-free columns worse:

| Shape                                       | 5 mixed | 5 with no modifiers |
| ------------------------------------------- | ------: | ------------------: |
| markers, today                              |    1488 |                1301 |
| props in one bag with the builder config    |    1488 |                1425 |
| props carried inside the column spec object |    1527 |                1443 |

**So the modifier-props change was not made in this pass.** The public spelling is
unchanged: modifiers still intersect in, the 19 marker interfaces are still there, and the
Go translator, the runtime bridge and the manifests were not touched.

### Correction: that rejection was measured on the wrong shape

Recorded here because it is the more useful lesson than anything else on this page. The
three prototypes above all KEPT `NormalizeCol`, which is how the spec described the change,
so they only ever removed `ColModsOf`. Measured that way, props are worth nothing, and that
is what was first reported.

It is the wrong test. Props are not worth having for what they remove from `NormalizeCol`;
they are worth having because they let `NormalizeCol` be **deleted**. Once the modifiers are
a type parameter, the column alias can expand straight to the branded column, `TypedCols`
takes its existing wholesale pass-through branch, and the whole normalization pass is gone.
An intersection cannot do that, because it can add facts but cannot flip a type parameter on
the column it intersects with. That is the only reason props are needed at all.

Measured on the same real packages, with `Equal<>` pins against the builder road on the
select AND insert models so a lossy prototype could not look cheap:

| Case                       | Today | Direct alias | Change |
| -------------------------- | ----: | -----------: | -----: |
| 20 plain columns           |  2116 |         1589 |   -25% |
| 5 mixed columns            |  1258 |         1048 |   -17% |
| wide vocabulary, 7 columns |  1956 |         1633 |   -17% |

Still not built here, because it breaks the authored spelling of every column and moves the
Go translator, the runtime bridge, the manifests, the docs and the examples with it. It is
specced, with the prototype, in
[`docs/todos/drizzle-normalize-col-carrier-cost.md`](../todos/drizzle-normalize-col-carrier-cost.md).

## What shipped instead

With the real cost located, four changes to the normalization itself, each measured on its
own. The builder road is byte-identical, because it never enters `NormalizeCol`.

| Case                              | Before | After | Change |
| --------------------------------- | -----: | ----: | -----: |
| type road, 5 mixed columns        |   1488 |  1258 |   -15% |
| type road, 5 mixed + insert model |   2125 |  1895 |   -11% |
| type road, 20 plain columns       |   2693 |  2116 |   -21% |
| builder road, any shape           |    646 |   646 |      0 |

In `packages/drizzle-orm/src/typeColumns.ts`:

1. **The key flags became a lazy member.** `RtTypedColumn` passed `ModKeyFlags<Spec, Mods>`
   as a type argument to `RtColumnKeyBrand`, which instantiates it on every declared column,
   though only mysql's `$returningId()` ever reads it. As a property type inside the generic
   interface, it is computed when read.
2. **The spec and the mods are extracted once and threaded down**, instead of five
   re-extractions, and `BaseFlag`'s per-probe mapped type (`{[K in Key]: true}`) is gone.
3. **One conditional pulls both out**, instead of `ColSpecOf` and `ColModsOf` each computing
   `keyof C`. The biggest of the four on tables that carry modifiers.
4. **The intrinsic flags became a name union.** Every column type used to instantiate
   `{notNull: false; hasDefault: false; primaryKeyHasDefault: false; autoincrement: false}`
   to say it had none. It now names only the flags it has, `never` for almost every builder.
   Five aliases carried flags and were updated: pg `serial` / `smallserial` / `bigserial`,
   mysql `serial`, sqlite `integer` / `int`.

And, because a stale number in a document is what sent this whole change down the wrong
road, the numbers moved out of the document and into a suite:
`packages/type-budget/test/typeRoad.compile.test.ts` re-measures six table shapes on every
run, ratchets them one-way downward, pins the shapes so a collapse to `any` cannot pass,
and writes `packages/type-budget/reports/type-road.md`.

`packages/drizzle-orm/TYPE-COST.md` was rewritten around the correction, and now points at
the suite for live figures.

## Deliberately not taken

Reading a column's four brand flags off ONE payload, instead of four separate
`C extends RtColumnBrand<infer ...>` probes, is a measured win on both roads (a
twenty-column builder-road select model went 465 to 363, and the model-pipeline total
dropped 13328 to 13271). It is not in the tree because `modelPipeline.compile.test.ts`
budgets each STEP and the change moves work between steps, so every shape of it pushes at
least two per-step deltas over one-way-downward budgets while the cumulative total falls.

That, and the roughly 60 net instantiations per column the carrier still costs, are specced
in [`docs/todos/drizzle-normalize-col-carrier-cost.md`](../todos/drizzle-normalize-col-carrier-cost.md).

## Done when, as it was written, against what happened

- **A measured before/after that isolates this change alone, TYPE-COST.md updated whichever
  way it goes, a null result included.** Done. The null result on the modifier change is
  recorded with the numbers that produced it.
- **The type road's cost has moved materially toward the floor, or the todo is closed with
  the measurement showing why it cannot be.** Both, in the end: the modifier change is
  closed with its measurement, and the cost moved 15 to 21% by a different route.
- **The builder road has not regressed, narrow and wide.** Verified: byte-identical at 5
  and 20 columns, and the whole model-pipeline suite is unchanged.
- **The three sentinel readers moved together.** Not needed. The sentinel encoding was not
  touched, so the runtime bridge, the Go convert program and the manifests are untouched.
- **Website docs and `packages/examples/` updated wherever the type road is spelled out.**
  Not needed: the authored spelling did not change.
- **Type-budget budgets lowered rather than raised.** Done, and a new suite added.
