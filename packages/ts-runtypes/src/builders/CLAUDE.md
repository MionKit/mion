# Type-instantiation cost of the builders and formats

This directory and its sibling [`../formats/`](../formats/) hold the type channel every
value-first schema resolves through, so their cost is paid by the consumer's editor and
by every `tsc` run. This file records what has already been measured, so the next person
optimising here starts from evidence instead of repeating it.

The measurements come from
[`test/types/builderCost.compile.test.ts`](../../test/types/builderCost.compile.test.ts),
which budgets 58 call sites across every builder and format family and writes
[`reports/builder-cost.md`](../../reports/builder-cost.md). Re-run it with
`pnpm exec vitest run builderCost`.

## ⚠️ Optimise the MARGINAL number, not a single call

A single call's instantiation count is mostly a **one-time** cost the file pays once,
whatever it is doing: resolving the overload set and the params interface. Measured here,
`TF.string({minLength: 5, maxLength: 20})` costs **225 at the first call site and 29 at
every one after it**. A real schema file is one import and many calls, so the second
number is the one that scales.

This is not a detail. Two of the rewrites below look like wins when measured as one call
and are losses in a real file. Every case therefore carries two budgets:

|            |                                              |
| ---------- | -------------------------------------------- |
| `fixed`    | net instantiations at the first call site    |
| `marginal` | net instantiations each additional call adds |

Containers also carry a per-member slope, and `object` is measured across all four
modifier profiles separately, because the profiles cost very differently (10 per field
all-required against 52 mixed optional+readonly) and a change that helps one arm can
regress another.

Two traps when adding a case:

- **Consume the result.** Read it back through `InferType` into an annotated const. A
  bare declaration measures nothing, because the checker stays lazy and the case looks
  free.
- **Sample inside one regime.** A builder with fixed-arity overloads changes regime
  partway: `union` resolves an overload up to 8 members and falls back to `UnionOf<T>`
  past that. A slope read across that boundary reports the one-off cost of crossing it
  as a per-member cost.

## What is already optimised

**`UnionOf` distributes, it does not recurse** ([`static.ts`](./static.ts)). `T[number]`
is the union of the tuple's members and `InferType` is a conditional on a naked type
parameter, so it distributes: one arm per member, no recursion.

```ts
export type UnionOf<T extends readonly RunType[]> = InferType<T[number]>;
```

The recursive `infer Head` / `infer Tail` form it replaced guarded against a subtype
reduction where a subset arm swallowed its superset (`{a} | {a; b}` → `{a}`). That
reduction no longer happens; the distributive form is type-identical across
subset+superset, disjoint, literal-widening, duplicate and `any` arms. A 24-member union
went from 1652 to 618 net instantiations, and the per-member slope past the arity
overloads from about 71 to 17.

Note this is **not** `MapTuple<T>[number]`: mapping first materialises the whole mapped
tuple before indexing it, which distributing skips.

**Preset format defaults merge in one mapped pass**
([`../formats/string/stringFormats.ts`](../formats/string/stringFormats.ts)).
`FormatDefaults` used to build a Pick, then an intersection, then flatten it again with
`Simplify` — three passes to produce the type one mapped pass over the combined key set
writes directly. `email({maxLength})` went from 340 to 279 fixed and 52 to 46 marginal;
`url`, `ip`, `domain`, `alpha` and `base64` moved the same way. The no-override fast path
in front of the merge stays: dropping it makes a bare preset cost 13 instead of 10.

## What was measured and REJECTED

Do not re-try these without new evidence. Each was implemented and measured.

**`ExactParams` fast paths.** Three cheaper spellings of the excess-key guard (an
`[Exclude<keyof P, keyof Allowed>] extends [never]` short-circuit, a
`keyof P extends keyof Allowed` form, and a mapped-type form). All were **more**
expensive than the current `P & Record<Exclude<…>, never>`: the guard costs more to test
than the `Record` it avoids building.

**Two-overload scalar leaves.** Folding the brand overload into an optional second
parameter saves 21 at the first call site and costs **2 more per call** after it. A net
loss for any file with more than a handful of fields, which is the case that matters.

**Single-scan `ObjectType`.** Three encodings (a marker union via `infer`, a "has any
modifier at all" short-circuit probe, and a `keyof M` union) each roughly halved the
all-required arm, 10 per field down to 6-7, and made **every** modifier profile worse by
about 6 per field. Real schemas have optional fields, so the trade is backwards. The
existing two-probe dispatch is the best of the four measured.

**Cheaper utility-builder capture.** This is the most useful negative result here.
`partial` / `required` / `readonly` / `pick` / `omit` / `nonNullable` each cost a flat
**~690 over their inner schema**, and it is not the utility type: a pass-through wrapper
that does nothing costs the same, and the figure does not move with field count. The cost
is inferring `T` by unifying the argument against `CompTimeArgs<RunType<T>>`.
`intersection` pays it once per positional member, which is why a two-member
`intersection` costs 954.

Capturing the RunType itself with a free `M` and reading it back through `InferType<M>`
halves it (690 to 349) and is type-identical, but it stops **rejecting** a non-RunType
argument. A conditional return guard (`M extends RunType ? … : never`) only turns the
result into `never` instead of erroring at the call site. Both are behaviour changes.
`M extends RunType` keeps the rejection and the full cost.

**`Override` as a single mapped type.** `{[K in Exclude<keyof Params, Pinned>]?: Params[K]}`
instead of `Omit<Partial<Params>, Pinned>` saved 2 per call on an overridden preset and
cost 3 on a **bare** preset, which is the more common spelling.

**Hand-deduplicating `FormattedObject`.** `ObjectLiteralPart<P>` appears twice there (the
emptiness probe and the brand payload). Binding it once and passing it to a helper
measured no cheaper, and slightly worse on two shapes. TypeScript already memoises
identical instantiations within a check, so **a repeated type reference is not a repeated
cost** — do not "optimise" one.

**Single-pass `ObjectParamsType`.** Collapsing `Flatten<Pick<…> & … & …>` into one mapped
pass is dramatically cheaper (18 per call down to 4) but drops the `readonly` on the
`patternProperties` / `propertyNames` slots, so the value-first type stops matching the
type-first spelling. A readonly-preserving two-pass variant is type-identical and cheaper
on the shapes carrying those slots (30 to 18) but neutral on the literals-only shape,
which is the common one.

## On `infer`

An early design rule said to avoid `infer` because a written-out type would be cheaper.
Treat that as retired. The numbers point both ways: removing `infer` from `UnionOf` was
the single biggest win recorded here, while the cheaper `ObjectType` and utility-builder
encodings that **used** `infer` lost on other grounds. `infer` is neither cheap nor
expensive as a rule. Measure the site.

## Where the cost still is

The highest remaining costs, from the committed report:

| Call                       | Fixed | Marginal |
| -------------------------- | ----: | -------: |
| `circular(self())`         |  1359 |      331 |
| `object(config, {params})` |   715 |      194 |
| `required(object)`         |   966 |      127 |
| `intersection(a, b)`       |   954 |      123 |
| `record(value, {params})`  |   571 |      118 |
| `array(item, {params})`    |   474 |       99 |

`circular` has its own budget suite
([`substituteSelf.compile.test.ts`](../../test/types/substituteSelf.compile.test.ts))
with two reviewed exceptions already documented there. The utility and `intersection`
rows share the single root cause described above, which has no known safe fix. The
container-with-params rows are the least explored and the most promising place to look
next: passing a params bag costs `object` +140 marginal over the bare call.

## Changing any of this

Budgets are one-way **downward**. Raising one needs a reviewed reason in the commit
message. The report under [`reports/`](../../reports/) is committed, so a cost change
shows up in the pull request diff rather than only in a console line nobody read.

The id **value** may move. What must not move is the id **contract**: the same source
type always resolves to the same id, and a builder-form schema and its equivalent
type-form spelling still land on the **same** id. That convergence is pinned by
[`test/suites/id-integrity/`](../../test/suites/id-integrity/),
[`test/types/staticEquivalence.test.ts`](../../test/types/staticEquivalence.test.ts), and
the Go translator's round-trip in `ts-go-runtypes/internal/convert`, which rewrites a
marker call between the two forms and asserts no id is lost or invented. Run all three
after any change here.
