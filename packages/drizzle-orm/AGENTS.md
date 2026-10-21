# @mionjs/drizzle-orm guidelines

Shared rules for this package and the 3 dialect packages (`drizzle-orm-pg-core`, `-mysql-core`, `-sqlite-core`).

## The boundary: what we wrap, what stays drizzle

Ask of any drizzle feature, in order:

1. drizzle-kit reads it off the schema file? → ours, must be RECORDED.
   `toDrizzle()` builds the object drizzle-kit reads: anything not recorded is absent from it.
2. App reads a row or payload type from it? → ours AND needs a model (`InferSelectModel` and friends).

- Everything else is drizzle's, called on the `toDrizzle()` result.
- Why: table types travel through the app without drizzle's generics.
  Query types are paid once, in the file running the query, where drizzle is loaded anyway.

Import from:

- `@mionjs/drizzle-orm-<dialect>-core`: columns, tables, schemas, enums, sequences.
- `@mionjs/drizzle-orm-<dialect>-core`: constraints, indexes, RLS policies + roles, views with explicit columns.
- `@mionjs/drizzle-orm`: `sql`, `Infer{Select,Insert,Update}Model`, `refineTableType`.
  Never `sql` from a dialect package.
- `@mionjs/drizzle-orm-<dialect>-core/drizzle`: `toDrizzle` (the `./drizzle` subpath).
- `drizzle-orm`: operators, aggregates, set operations, relations.
- `drizzle-orm/<dialect>-core`: config readers (`getTableConfig`, `getViewConfig`, `isPgEnum`).
- `drizzle-orm/<provider>`: provider helpers (`crudPolicy`, supabase roles). Pass the result into extraConfig.

## The one exception: query-builder views

- `pgView('v').as(qb => qb.select()...)` passes question 1 but stays drizzle's.
- Why: its columns come from drizzle's select typing, the exact generic chain this design removes.
- Declare it with drizzle over `toDrizzle()` tables.
- Explicit-column view form is ours, so a view typed in your app stays slim.
- View row type = `InferSelectViewModel`, a separate name from the table one.
  Same split as drizzle (a view is read-only).

## In practice

```ts
import {pgTable, uuid, varchar} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {eq} from 'drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {id: uuid({primaryKey: true}), name: varchar({length: 50, notNull: true})});
export type User = InferSelectModel<typeof users>; // no drizzle types anywhere

declare const db: PgDatabase<PgQueryResultHKT>;
const usersDb = toDrizzle(users); // the real drizzle table, built on demand
db.select().from(usersDb).where(eq(usersDb.id, 'some-id'));
```

## Dialects

- RLS (`pgPolicy`, `pgRole`, `.enableRLS()`): pg ONLY.
- Identity columns, sequences (`pgSequence`), materialized views: pg ONLY.
- Schemas: pg + mysql (`mysqlSchema`). sqlite has none.
- Enums infer the literal union in every dialect. `text('x', {enum: [...]})` works in all three.
- `pgEnum` standalone handle (reusable object you export for drizzle-kit): pg ONLY.
  mysql `mysqlEnum` keeps the values on the column. sqlite has no enum function.
- Per-dialect detail: `packages/drizzle-orm-<dialect>-core/AGENTS.md`.

## Coverage, migration, e2e

- Coverage gated by the manifests: `pnpm miondevx core drizzle-manifest --check`.
- Mapping rules + boundary pass: [drizzle-slim-schemas skill](../../.agents/skills/drizzle-slim-schemas/).
- `mion drizzle-migrate`: moves an existing drizzle schema onto these packages (same boundary, by machine).
  - Splits each declaration into a `X$table` recorder and `X = toDrizzle(X$table)`.
  - Folds each column's modifier chain into its one settings object.
  - Refuses what the import list above keeps on drizzle.
- `mion convert --to type`: one step further, onto the pure-type road, in either direction.
- `pnpm miondevx release drizzle-e2e`: drizzle's OWN integration suites through BOTH translations
  against real postgres, mysql and sqlite.
  Only proof a materialized table works against a database, not just against another type.
