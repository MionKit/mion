---
type: chore
spec: guidelines
status: ready
created: 2026-08-29
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
