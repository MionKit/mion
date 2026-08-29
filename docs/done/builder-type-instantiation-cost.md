---
type: chore
spec: guidelines
status: done
created: 2026-08-29
updated: 2026-08-29
---

# Cut the type-instantiation cost of the builders and format types

## Intent

The typecost benchmark (`container/benchmarks/typecost/typecost.mjs`, shown on the
site at `07.benchmarks/07.compiletime.md`) puts zod BELOW us on type
instantiations, even though zod's chained form (`z.string().max(20).min(5)`)
should in theory cost more than our single-call form
(`RT.string({min: 5, max: 20})`). Every instantiation is paid by the consumer's
editor and by every `tsc` run, so this is a real user-facing cost.

Second thing to retest: an early design premise said "avoid `infer`, a written-out
type is cheaper". That was never measured, and `infer` is already used in 10 source
files (including `src/builders/static.ts`). Treat it as a measurable choice per
site, not a rule.

Strictly a cost exercise. No behaviour change and no public API change.

## Direction

**Measure first, one builder / format at a time.** There is no budget suite for
builder or format CALL SITES today. The existing ones cover the walkers only
(`dataonly`, `stripmeta`, `substituteSelf`, `friendlyText`, `mockData` under
`packages/ts-runtypes/test/types/`). Build the missing one and use it as the
accept/reject gate for every experiment.

Reuse, do not copy, `makeMeasurer` from
`packages/ts-runtypes/test/types/compileHarness.ts`. It already supports the two
modes needed: the self-contained sliced-preamble one, and the real-import one
(`snippetFile` + `diagnosticsScope: 'snippet'`) that `packages/type-budget` uses.
Builder call sites need the real overload declarations, so the real-import mode is
the likely fit. Budgets stay one-way DOWNWARD, same ratchet the existing suites
document.

Suspect list, verified to exist, in rough order of likely payoff. The implementer
confirms each with numbers before touching it:

- `src/formats/scalars.ts` — every scalar leaf is THREE overloads, and each one
  spells `LeafType<'stringFormat', P, B>` TWICE (once in the `id?` parameter, once
  in the return type). Failed overload attempts still instantiate.
- `ExactParams<P, Allowed> = P & Record<Exclude<keyof P, keyof Allowed>, never>`
  (`src/runtypes/builderTypes.ts:96`) — an `Exclude` over `keyof P` per call.
- `LeafType` / `LeafTypeByFormatName` (`src/runtypes/builderTypes.ts`) — the
  temporal rows self-guard with `P extends MinMax ? … : never`, so the whole
  interface instantiates to read one key.
- `src/formats/string/stringFormats.ts` — ~50 preset aliases, each
  `PresetFormat<Tag, Defaults, P>` over `FormatDefaults` (already has a
  no-override fast path, check it still fires) and each generic param bounded by
  `Override<Params, Pinned> = Omit<Partial<Params>, Pinned>`.
- `TypeFormat` (`src/runtypes/typeFormat.ts:56`) — `Base & FormatBrand<…> &
  ([BrandName] extends [never] ? unknown : NominalBrand<…>)`, paid by every
  format type in the tree.
- `ObjectType` (`src/builders/static.ts:139`) — runs `AnyOptional` AND
  `AnyReadonly`, two full key scans, before picking one of three `Flatten` mapped
  types.
- `src/builders/compose.ts` — `union` has 8 arity overloads plus a variadic one;
  `object` / `array` / `record` / `tuple` carry `const` type params.
- `src/formats/structural.ts`, `src/formats/numberFormats.ts`,
  `src/formats/bigintFormats.ts`, `src/formats/datetime/*` — same shapes, lower
  volume.

Note the precedent already in the tree: `markers.ts:188` records that a phantom
intersection cost ~700 instantiations per call, which is why `CompTimeArgs<T>` is
a bare `T` and the Go scanner reads it syntactically. Same kind of win is what
this todo is hunting.

**Accept / reject rule.** Keep a change if it lowers net instantiations without a
significant complexity increase. Keep it also if it lowers complexity at equal
cost. Discard anything that does not lower the number. Commit incrementally, one
builder or format family per commit, each with its budget lowered in the same
commit.

## Guard rails

**The id VALUE is free to move. What must not move is the id CONTRACT.** A
reflected type that hashes to a different string is fine, as long as all three of
these still hold:

1. **Idempotency.** The same source type always resolves to the same id. The id
   stays `f(T)` and nothing outside `T` leaks into it.
2. **Convergence.** A builder-form schema and its equivalent type-form spelling
   still land on the SAME id. That is the whole point of the value-first surface.
   Pinned by `test/suites/id-integrity/` (runtime) and
   `test/types/staticEquivalence.test.ts` (type level). The cases already flagged
   `idDivergent` stay divergent on purpose, do not "fix" them.
3. **The Go code translator still round-trips.** `ts-go-runtypes/internal/convert`
   rewrites a marker call between its type form and its builder form in both
   directions, and its oracle is exactly invariant 2: converting must never lose
   an id or invent one. Run `go -C ts-go-runtypes test ./internal/...`, and pay
   attention to `convert/callsites_test.go` and `convert/roundtrip_test.go`.

Anything that changes the reflected TYPE (not just its hash) breaks 2 and 3 and is
out of bounds. Also keep green: `test/types/typesafety.test.ts`,
`test/types/formatIntrospection.test.ts`, and the whole `pnpm test` run.

The implementer plans the details: where the suite lives, the exact case set,
budget seeding, and which experiments to try per family.

## Done when

A per-builder / per-format instantiation-budget suite runs under `pnpm test` with
seeded one-way-downward budgets; the families where a win was found are landed
with their budgets lowered; the ones where nothing helped are recorded as measured
and left alone; the public API and the reflected types are unchanged and the three
id guard rails above are green; and the typecost benchmark is re-run to show the
new position against zod.

## Plan and outcome (approved 2026-08-29, shipped 2026-08-29)

Scope confirmed with the requester: the full sweep in one pull request.

### What was built

A per-call-site budget suite,
[packages/ts-runtypes/test/types/builderCost.compile.test.ts](../../packages/ts-runtypes/test/types/builderCost.compile.test.ts)
plus [builderCostHarness.ts](../../packages/ts-runtypes/test/types/builderCostHarness.ts),
covering 58 cases across every builder and format family. It reuses `makeMeasurer`
from the existing [compileHarness.ts](../../packages/ts-runtypes/test/types/compileHarness.ts)
in its resolving mode, so counting and baseline subtraction stay identical to every
other budget suite here. It writes a committed report to
[packages/ts-runtypes/reports/](../../packages/ts-runtypes/reports/), following the
pattern `packages/type-budget/test/report.ts` established, so a cost change appears
in the pull request diff.

### The finding that shaped everything

**A single call's instantiation count is the wrong number to optimise.** Almost all
of it is a one-time cost the file pays once: `TF.string({minLength, maxLength})` cost
225 at the first call site and 29 at every one after it. A real schema file is one
import and many calls, so the suite reports `fixed` and `marginal` separately, each
with its own budget. Containers also get a per-member slope, and `object` is measured
across all four modifier profiles, because a change that helps the all-required arm
can regress the mixed one.

Had the suite measured only single calls, both of the "wins" this task rejected would
have looked like wins.

### Wins landed

**`UnionOf` distributes instead of recursing.** `T[number]` is the union of the
tuple's members and `InferType` is a conditional on a naked type parameter, so it
distributes: one arm per member, no recursion. The recursion guarded against a
subtype reduction that no longer happens; the distributive form is proven
type-identical across subset+superset, disjoint, literal-widening, duplicate and
`any` arms. A 24-member union went from 1652 to 618 net instantiations, and the
per-member slope past the arity overloads from about 71 to 17.

**Preset format defaults merge in one mapped pass.** `FormatDefaults` built a Pick,
then an intersection, then flattened it again. `email({maxLength})` went from 340 to
279 fixed and 52 to 46 marginal; `url`, `ip`, `domain`, `alpha` and `base64` moved the
same way. Bare presets are untouched, since the no-override fast path short-circuits
ahead of the merge.

### Measured and rejected

Seven experiments were implemented, measured and discarded. They are recorded with
their numbers in the suite's file header so nobody spends them again: `ExactParams`
fast paths (three encodings, all worse), two-overload scalar leaves (cheaper fixed,
dearer per call), single-scan `ObjectType` (three encodings, each trading the
all-required arm against every modifier profile), cheaper utility-builder capture
(halves the cost but stops rejecting a non-RunType argument), `Override` as a single
mapped type (worse on the common bare preset), hand-deduplicating `FormattedObject`
(no gain, TypeScript already memoises identical instantiations), and a single-pass
`ObjectParamsType` (drops a `readonly`, so the value-first type stops matching the
type-first one).

The most useful of these is the utility-builder result. `partial` / `required` /
`readonly` / `pick` / `omit` / `nonNullable` each cost a flat ~690 over their inner
schema, and it is not the utility type: a pass-through wrapper that does nothing
costs the same, and the figure does not move with field count. The cost is inferring
`T` by unifying the argument against `CompTimeArgs<RunType<T>>`. `intersection` pays
it once per positional member. The only cheaper form loses the call-site rejection of
a non-RunType argument, which is a behaviour change.

### The `infer` premise

Retired, with numbers pointing both ways. Removing `infer` from `UnionOf` was the
single biggest win in this change, while the cheaper `ObjectType` and utility-builder
encodings that used `infer` lost on other grounds. `infer` is neither cheap nor
expensive as a rule; it has to be measured per site.

### Coverage gap found and closed

The first version of this suite missed the container-with-params path, which turned
out to be the most expensive thing measured outside recursion:
`object(config, {params})` costs 194 per call against 54 bare. Six cases were added.
It also measured `union` across 8 to 16 members, which crosses from the fixed-arity
overloads into the `UnionOf` fallback, so it reported the one-off cost of the regime
change as a per-member cost. Each regime is now sampled inside itself.

### Guard rails

All green: `test/suites/id-integrity/` (774 tests), `staticEquivalence.test.ts`,
`typesafety.test.ts`, `formatIntrospection.test.ts`, the whole `runtypes` project
(8820 tests), every `test:ci` batch, and
`go -C ts-go-runtypes test ./internal/...` including the `convert` round-trip that
pins builder-form and type-form convergence. Lint, typecheck and format clean.

### Not done

**The typecost benchmark was not re-run**, so this change carries no fresh
measurement of our position against zod. It needs the `tsrt-website` container image,
and this environment cannot get it: GHCR returns `unauthorized` and a local build
cannot fetch its base image through the proxy (`Forbidden` from the Docker CDN). The
internal budget report is the evidence for what moved. Split out as
[docs/todos/rerun-typecost-benchmark.md](../todos/rerun-typecost-benchmark.md).

**No website docs**, deliberately. A contributor-only measurement tool does not
belong in the consumer docs tree; the tuning workflow lives in the test file header,
following the precedent in
[type-perf-model-pipeline-budget.md](type-perf-model-pipeline-budget.md).

**No fuzzing**, deliberately. Deterministic counters over a fixed snippet set have no
oracle to fuzz against.
