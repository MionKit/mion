# Type-instantiation cost of the builders and formats

The type channel every value-first schema resolves through lives in this directory and
its sibling [`../formats/`](../formats/), so its cost is paid by the consumer's editor and
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

Two traps when adding a case, and one that outranks both:

**A per-case number can lie.** Every per-call case wraps a FRESH inner schema, so a
change that gets cheaper at resolving a brand-new object type looks like a big win.
Real code names its schemas and passes the name (`RT.partial(User)`), so the child is
already resolved and the saving never arrives, while any per-call regression the same
change introduced arrives in full. The whole-module case in the suite exists to catch
exactly this, and it has caught it once already (see `RunTypeArg` below). **Check it
before believing a win.**

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

**A cheaper child-schema constraint.** Replacing
`<T>(child: CompTimeArgs<RunType<T>>)` with
`<M extends {id: string; kind: unknown}>(child: CompTimeArgs<M>)`, reading the type back
with `InferType<M>`, skips the unification described above. The constraint is genuinely
not weaker: `id` and `kind` are the only members `RunType` requires, so the two types are
mutually assignable and reject the same inputs. (`kind: unknown` is deliberate; `number`
would be stricter than `RunType` and reject real schemas.) The per-case numbers looked
decisive: `array(object)` 899 to 569, `partial(object)` 905 to 575, a nested object 361
to 26.

It is still a **loss**, and this is the cautionary tale of the file. The whole-module case
went 1723 to **1861**. A leaf child costs a flat ~16 more (`array(string())` 73 to 89) and
the per-call marginal rose (`partial` 77 to 92, `required` 127 to 148), while the headline
win only exists when the call site resolves a brand-new object type — an artefact of how
the per-case snippets are written. Applying it to the utility wrappers alone, whose
children are always objects, still measured 1736.

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

## How this compares to zod

Measured locally against zod 4.4.3 with the same harness (net instantiations, import
scaffold already subtracted). Not the website benchmark, which subtracts a per-library
baseline and may rank differently.

| case                                               | here | zod 4 |
| -------------------------------------------------- | ---: | ----: |
| record, 20 required fields                         |  362 |   425 |
| union of 4 literals                                |  107 |   405 |
| `string({minLength, maxLength})` vs `.min().max()` |  225 |   301 |
| record, 20 fields half optional                    |  702 |   479 |
| object inside object                               |  594 |   215 |
| array of objects                                   |  899 |   255 |
| `email()`                                          |  123 |    26 |

The params bag beats the method chain, so that premise holds. Where we lose is any
builder taking a schema as a child argument when that child is an object, which is the
`CompTimeArgs<RunType<T>>` unification above. `object` itself is fine because it takes a
config record rather than a `RunType<T>`, which is why nesting an object inside an object
costs +374 once and only +53 per level after.

That gap is real and unclosed. The obvious fix for it is the `RunTypeArg` experiment
above, which measured worse on a whole module.

## Spike: lazy type resolution (the zod architecture)

zod does not accept any object, and it does guard its child arguments — `z.array({})`
is rejected. Its constraint is a one-member structural shape, the same trick tried
above:

```ts
export type SomeType = {_zod: _$ZodTypeInternals};
declare function array<T extends SomeType>(element: T, …): ZodArray<T>;
export type output<T> = T extends {_zod: {output: any}} ? T['_zod']['output'] : unknown;
```

The difference is that zod's return type stays LAZY. `ZodArray<T>` carries the schema
and never computes the element type; `z.infer` resolves it on demand. We return
`RunType<T[]>`, which forces the element type at the call site.

A prototype of both architectures on identical stubs, measured:

| shape                                        | eager (today) |    lazy |
| -------------------------------------------- | ------------: | ------: |
| nested array-of-object, 4 levels, read once  |           264 | **131** |
| realistic module, read at the top            |       **328** |     369 |
| type read at every level                     |       **155** |     275 |
| 4 levels, marker injected at every call site |       **309** |     452 |

Lazy wins on DEPTH read once (+10 per level against +41) and loses everywhere else,
because each read re-resolves the whole node chain from the leaves while eager resolves
once per level and banks it in the phantom.

**The last row is why this is not worth pursuing.** The build transform injects an
`InjectRunTypeId<…>` argument at EVERY builder call site, and the resolver reads the
reflected type off it, so the built program forces a resolution at every level — lazy's
worst case, and the gap grows with depth. zod can defer because it has no per-call-site
marker to satisfy. Ours is the price of the side-channel resolver, not an oversight.

One more constraint any lazy rewrite would have to carry: `circular` needs BOTH
modes at once. It brands the FULLY-RESOLVED `Recursive<Body>` so the resolver reflects
an ordinary recursive type, while the self-edge inside stays deferred — that deferral is
what makes the walk terminate. It is not just a cost question there: the
`substituteSelf.compile.test.ts` header records that the cheaper probes tried for it,
an assignability check and an `infer`-based slot read, each FORCE the deferred recursive
type and trip TS2589 on every recursive schema. So the eager/lazy split in that corner is
load-bearing for correctness, and a wholesale move to lazy would have to reproduce it
rather than inherit it.

Worth knowing for any future attempt: TypeScript is ALREADY lazy about a builder's
return type. A call whose result is never read costs 8 rather than 36. What forces
resolution early is not the return type but the ARGUMENT, when a composer unifies its
child against `RunType<T>` — which is the cost described under the utility-builder
result above, and the one real lever left.

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
