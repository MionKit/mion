---
type: chore
spec: full-plan
status: ready
created: 2026-08-30
---

# The slim table type becomes the meta itself

## Problem

A slim drizzle table names its columns twice, and wraps the useful half in a symbol:

```ts
// packages/drizzle-orm-pg-core/src/table.ts:58
export type PgBuilderTable<TName extends string, Cols extends object, Extras extends readonly object[] = []> = Cols & {
  readonly [rtTableKey]: RtTableMetaWithExtras<TName, Cols, Extras>;
};
```

The `Cols &` arm makes `table.column` a property. The meta under the symbol key is what
every reader actually uses (`ColsOf`, the models, `refineTableType`, `toDrizzle`, the
reflection bridge). The symbol wrapper itself exists only to say "a table lives below".

The meta IS the table, so the type should just BE the meta, with its own brand inside it.

Measured on the real packages (`packages/drizzle-orm/TYPE-COST.md`): about 5 instantiations
a table, 86 across the whole model pipeline, and 7-8% off the generated reflection cache
module. **That saving is small and that is understood. It is not the goal.**

## The goal is removing complexity

Every simplification the new shape allows is in scope. A change that lands the shape while
leaving the old scaffolding standing has missed the point. Judge the result by how much
smaller and more obvious the table types are, not by the budget delta.

- **The intersection arm**, gone from five aliases (`RtTable`, `PgBuilderTable`,
  `PgTableWithRLS`, `MysqlBuilderTable`, `SqliteBuilderTable`) and its view twin.
- **The symbol indirection**, in 12 places. `T[typeof rtTableKey]['columns']` becomes
  `T['columns']`; in the bridge, `memberNamed(graph, '@rtTableKey').child` becomes reading
  the root's own members.
- **The two near-identical meta interfaces.** `RtTableMeta` and `RtTableMetaWithExtras`
  (`table.ts:28-40`) differ by one member, and the comment explaining why they are separate
  is about paying for an intersection at the meta key, which no longer exists. Evaluate
  merging them into one with `Extras = []` defaulted.
- **The `PgTable` / `PgBuilderTable` alias split**, three times over. The comment at
  `table.ts:42-47` justifies it by declaration emit printing the columns record twice when
  the same `Cols` fills two slots. With one column position left, re-test that: if
  `TypedCols<AlreadyNormalized>` still takes its wholesale branch, the pair may collapse to
  one alias per dialect. Verify with `declarationEmit.test.ts` rather than assuming.

## What two spikes already settled

- **The blocker.** A bare meta carries no sentinel, so nothing can tell a table from any
  other object. Prototyped: 13 of `typeTables.spec.ts`'s 20 cases fail with "the reflected
  type is not a table". `buildRtTableFromGraph` finds a table by its `@rtTableKey` member
  (`fromType.ts:333`) and the Go convert program does the same (`drizzle.go:96,122,1288`).
- **The answer.** Moving the brand INSIDE the meta costs **zero** instantiations: 920 with
  or without it, measured both as a plain string-literal member and as a symbol member, on
  a 5-column and a 20-column table.

## The brand carries the dialect, and that closes a real hole

All three dialects' `toDrizzle` take the same dialect-blind `AnyRtTable`, so this compiles
today and fails at run time:

```ts
import {toDrizzle} from '@mionjs/drizzle-orm-mysql-core/drizzle';
toDrizzle(somePgTable);   // TypeError: dzMy.pgTable is not a function
```

`materializeRtTable` replays the table's OWN captured `buildTable` closure against whichever
dialect's context it was handed, so a pg table run through mysql's `toDrizzle` reaches for
`context.ns.pgTable` and finds nothing. A dialect-tagged brand makes that a compile error,
in every dialect's `toDrizzle` and `tableFromType` at once. That is worth more than the
instantiations this change was started for.

## Plan

**1. The table type becomes the meta, branded from inside with its dialect.**

```ts
// packages/drizzle-orm/src/table.ts:28-46
export interface RtTableMeta<TName extends string, Cols, Dialect extends string = string> {
  readonly [rtTableBrand]?: Dialect;   // 'pg' | 'mysql' | 'sqlite' | ...
  name: TName;
  columns: Cols;
}
export type AnyRtTable = RtTableMeta<string, Record<string, AnyRtColumn>>;
export type TableNameOf<T extends AnyRtTable> = T['name'];
export type ColsOf<T extends AnyRtTable> = T['columns'];
```

A NEW symbol, not the existing `rtTableKey`: that one already means "the runtime state" on
the value, and reusing it for "I am a table" on the type would give one symbol two jobs.
Symbol-keyed rather than a plain `dialect` member so detection stays nominal (any object
could have a `dialect` field); optional, matching the house sentinel convention in
`typeColumns.ts`. Optional still rejects the cross-dialect call, because `'pg' | undefined`
is not assignable to `'mysql' | undefined`.

Each dialect pins its own tag, and its `toDrizzle` / `tableFromType` narrow to it instead of
the shared `AnyRtTable`. Pg's `enableRLS()` stays an extra member in the same object, never
a second intersection arm (+4 per table, already measured).

**2. The runtime object does NOT change.** `createRtTable` keeps returning
`{...columns, [rtTableKey]: runtime}`, because `extraConfig((t) => [index().on(t.name)])`
and `references(() => teams.id)` read those properties at run time. Only what the TYPE
promises changes. State that in the code: the slim table type is a type-level DESCRIPTOR,
not a mirror of the runtime object.

**3. Property access gets an accessor.** Prototyped, identity at run time:

```ts
export function cols<T extends AnyRtTable>(table: T): ColsOf<T> {
  return table as unknown as ColsOf<T>;
}
// references(() => teams.id)  ->  references(() => cols(teams).id)
```

**4. Views get the same treatment** (`view.ts:26-35`) with their own brand, so the two stay
symmetrical and `toDrizzle`'s overload set can still tell a table from a view.

### Files to change

**Types (the core of it).** `packages/drizzle-orm/src/table.ts:28-46` and `view.ts:26-35`;
the three dialect `src/table.ts` aliases; the three `src/drizzle.ts` `toDrizzle` overload
sets and `tableFromType` signatures, narrowed to their own dialect tag; `refine.ts:56`
(`RefinedTable`), which must now thread the dialect through. `models.ts` needs no edit, it
reads through `ColsOf`.

Note while there: `RefinedTable` builds `RtTable<...>`, which drops `extras`. Pre-existing;
carry it over unchanged, do not silently fix it.

**Detection.** `fromType.ts:333` stops descending into the sentinel's child and reads
`name` / `columns` / `extras` off the root, after asserting the brand is present. It can
now also check the reflected dialect against the bridge it was called through.

**Go.** Four sites, all in `ts-go-runtypes/internal/convert/drizzle.go` — the constant at
`:44`, the two `typeHasSentinel` guards at `:96` and `:122`, and `member(root, sentinelTable)`
at `:1288`. Nothing outside `internal/convert/` matches the sentinel. The emit paths keep
printing `DB.PgTable<'t', {...}>` unchanged, but the builders road prints
`references(() => parents.id)` (`:773` parse, `:959` emit) and must learn `cols(...)`.

**Test harnesses that BUILD synthetic graphs** — these hand-roll the wrapper shape:
`packages/drizzle-orm/src/fromType.spec.ts:50` (`tableNode`) and
`packages/drizzle-orm-pg-core/test/tableSpecShared.ts:441` (`syntheticTableGraph`), whose
`renderTableBuilders` also emits `foreignColumns: [parent.id]` at `:347`.

**Call sites needing `cols()`** — 16 in the dialect specs, 7 assertions in
`drizzle_test.go`, 3 in `packages/examples/src/drizzle/`, 1 in
`container/website/sites/mion/content/03.drizzle-orm/03.indexes-constraints.md:43`.

## Tests

- The three dialect `index.spec.ts` + `typeTables.spec.ts` (the two-roads oracle), and
  `fromType.spec.ts` for the new graph shape.
- **New:** a per-dialect negative pin that `toDrizzle` and `tableFromType` REJECT another
  dialect's table at compile time. This is the hole the change closes, so it needs its own
  test, not just a passing suite.
- `drizzleTypeSource.integration.spec.ts` — real resolver over generated type source. Its
  Marker rule pair (static `getRunTypeId<T>()` vs the value probe) must still agree, per the
  Marker test coverage rule in [ts-go-runtypes/CLAUDE.md](../../ts-go-runtypes/CLAUDE.md).
- `tableEquality.fuzz.spec.ts` — `pnpm rtx core fuzz drizzletypes`.
- Go: `go -C ts-go-runtypes test ./internal/...`.
- Budgets: `pnpm --filter @mionjs/type-budget test`. Every budget should DROP; commit the
  regenerated reports. Add a case pinning that the dialect brand is free (the exact
  `[rtTableBrand]?: 'pg'` spelling was not measured on its own, only the two shapes it
  combines, so confirm it rather than assume it).

## Docs

`container/website/sites/mion/content/03.drizzle-orm/` — the constraints page teaches the
drizzle `references(() => teams.id)` spelling and needs the accessor. Check the rest of that
section for the same pattern. The three `packages/examples/src/drizzle/` files the docs
import compile under the root typecheck, so they fail CI if missed.
`packages/drizzle-orm/CLAUDE.md` and the drizzle-slim-schemas skill both show table code.

## End-to-end

Five lanes over four images (`scripts/release/drizzle-e2e.mjs:36`,
`scripts/container/image.mjs:70`):

```bash
pnpm rtx core drizzle-translate            # host only, both roads, no container
pnpm rtx core drizzle-translate --to-types
pnpm rtx container pull drizzle-pg drizzle-mysql drizzle-sqlite drizzle-cloudflare
pnpm rtx release drizzle-e2e               # pg, mysql, sqlite, d1, durable
```

This is the gate that matters: it re-translates drizzle's own suites with
`ts-runtypes drizzle-migrate`, converts them again with `convert --to type`, and runs all
three trees against real databases. A schema with a foreign key goes straight through the
`references(() => cols(x).id)` change, so a green run is what proves the emit path.

## Out of scope

The runtime slim table object. `refineTableType` dropping `extras`. Any change to how
columns themselves are typed.

## Done when

`pnpm test`, `pnpm run lint`, the Go suite and all five e2e lanes are green; a cross-dialect
`toDrizzle` is a compile error with a test pinning it; the budget reports are regenerated
and lower; `TYPE-COST.md` is rewritten so it records the shipped shape rather than arguing
against it.

And, because it is the actual goal: each of the four simplifications listed at the top has
either been taken or has a measured reason recorded for why it could not be. The table
types should read as plainly at the end as the idea behind them.
