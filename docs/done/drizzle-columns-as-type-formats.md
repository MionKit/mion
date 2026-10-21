---
type: feature
spec: full-plan
status: done
created: 2026-09-25
---

# Drizzle columns as type formats: one column type for builders and hand-written tables

## What shipped

Phases 0 to 2 of the plan, for pg, side by side with the shipped system. Nothing public changed:
the new code lives in `packages/drizzle-orm/next/` and `packages/drizzle-orm-pg-core/next/`,
which both `tsconfig.build.json` files exclude. It sits beside `src/`, not inside it as planned,
because the drizzle version line republishes on any `src/` change
(`scripts/lib/drizzle-line.mjs`, `isTrackedSource`).

The owner then decided (Phase 3): switch later, in its own change, and treat pure-function
callbacks as their own piece of work. Both are separate specs.

### The design that came out of it

- A column type is `Column<Fn, Props, Data, Base>`: one optional spec sentinel, no methods, no
  db name, no owning table. One column shape is one type and one runtype entry in every table.
- Db names that differ from the record key sit on the table:
  `PgTable<Name, Cols, Extras, Names>`. `toDrizzle` puts them back into drizzle's column types
  (drizzle's `BuildColumns` stamps the db name, or the key when nameless), so only files that
  run queries pay for them.
- **Builders take every setting in one call** (the owner's call, see below), spelled exactly as
  the hand-written props: `varchar('name', {length: 100, notNull: true})`. A builder returns the
  column type itself, or a `NamedColumn` wrapper when called with a db name, which `pgTable`
  lifts into the names map. References are `[() => tableRef(t, 'id'), actions]`, callbacks
  `[fn]`, a type override `$type<T>()`.
- Models derive every flag from the raw props when read.
- A reference is plain data, `{table, column}`. `tableRef(t, 'id')` returns it and checks the key;
  `TableRef<T, 'id'>` spells it in a type, and `TableRef<'t', 'id'>` annotates a self-reference,
  which TypeScript cannot infer inside its own initializer (TS7022).

### How it planned vs how it went

- **Chained modifiers were dropped.** The plan kept drizzle's chain and listed single-call as a
  fallback. Two findings made the chain the wrong architecture here, and the owner chose
  single-call:
  - the runtype id walks method return types, so a column type with chain methods is an endless
    walk (MKR009); the chain needed a separate builder type;
  - the resolver serializes an alias's type arguments, so any alias over the builder record
    (`LiftCols<Cols>`, a `PgBuilderTable` alias) reflected the builders and hit the same cap.
    `pgTable` / `pgView` now spell both maps inline.
  Single-call builders are about as cheap as chained ones were (better on wide tables and
  queries, 9 to 11% worse on tables with many settings per column).
- **Spelling (b)**, a column that IS its data type plus metadata like a `TypeFormat`, measured
  worse everywhere and was rejected. The backup, db names inside columns, measured 3x worse on
  20 columns and was not needed.
- **A builder table's type records no `extraConfig` entries**, as on the shipped builder road,
  so it equals its hand-written twin only when the twin has no extras. The resolver fuzz
  compares columns, names and models.

### Numbers (reports/column-formats.md, 2026-09-25)

| Shape | shipped builders | shipped types | new types | new builders |
|---|---:|---:|---:|---:|
| 5 mixed, select | 570 | 971 | 539 | 971 |
| 40 plain, db name per column | 565 | 2418 | 480 | 994 |
| wide vocabulary | 676 | 1175 | 702 | 1293 |
| toDrizzle + three queries | 8643 | 9461 | 8812 | 9915 |

The isolation run the plan asked for (shipped type road, 20 plain columns): 1319 as shipped,
773 with flags fixed, 475 nameless, 317 both. Names inside columns were the larger cost.
Every attempt is recorded in `packages/drizzle-orm/TYPE-COST.md`, "Side by side: columns as type
formats", with the older conclusions it corrected.

### Tests

- `packages/private-type-budget/test/columnFormats.compile.test.ts` (four lines per shape,
  budgets on the new lines, shape pins), plus new cases in `declarationEmit.test.ts` and
  `drizzleFreeAuthoring.test.ts`.
- `packages/drizzle-orm-pg-core/test/next/`: type pins (a loose builder column, a table with
  names, the wide vocabulary, references, a self-reference, views, enums, refine key flags and
  `toDrizzle` names all equal their hand-written twins, and models equal the shipped models),
  runtime parity with raw drizzle and the shipped builders, `tableFromType` over hand-written
  types, runtype ids in both call shapes, shared runtype entries, and builder tables reflected on
  their own.
- Fuzz: `tableEquality.fuzz.spec.ts` gained the new builders and the new reader as surfaces
  (3,000 random tables clean); `test/next/drizzleTypeSource.integration.spec.ts` runs random
  tables through the real resolver (240 tables soaked). Both proved their oracle with a negative
  control.

### Fixed on the way (shipped code, own commits)

- `toDrizzle` named every drizzle column by its record key; drizzle uses the db name, and its
  `InferSelectModel<T, {dbColumnNames: true}>` reads it. The type road now gives the db name, the
  builder road `string` (its type does not carry one). All three dialects. The model-pipeline
  total rose 13597 to 13611 as a reviewed exception.
- `mion convert` printed a self-reference without its return annotation (TS7022 in strict mode);
  it now prints `(): AnyRtColumn =>` and drops that import again on the way back.
- The fuzz fixtures referenced a parent column as `parent.id`, a type error the shipped
  `references()` never surfaced; they use `cols(parent).id`.
- Self-reference tests on the shipped road, builder and type, and a Go convert round trip.

### Findings handed to parallel sessions

- A marker call nested inside another marker call's arguments gets no id.
- The pure-fn id doc comment and the PFE9012 / PFE9014 messages still describe location-based ids.
- (From the investigation) refined tables drop column key flags; stale comments in the Go
  convert program.

### Documents that may go stale once this merges

- `packages/drizzle-orm/TYPE-COST.md` (the side-by-side section describes code that the switch
  will move).
