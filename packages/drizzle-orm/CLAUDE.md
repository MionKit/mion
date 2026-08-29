# @mionjs/drizzle-orm guidelines

## The boundary: what we wrap, what stays drizzle

Ask two questions of any drizzle feature, in order:

1. **Does drizzle-kit read it off the schema file?** Then it is ours and must be RECORDED: `toDrizzle()` builds the object drizzle-kit reads, and anything we do not record is simply absent from it.
2. **Does the app read a row or payload type from it?** Then it is ours AND needs a model (`InferSelectModel` and friends).

Everything else is drizzle's, called on the `toDrizzle()` result. That is the whole point of the slim packages: a table's types travel through the app without dragging drizzle's generics, and a query's types are paid once, in the file that runs the query, where drizzle is loaded anyway.

| What                                                                         | Import from                                                |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Columns, tables, schemas, enums, sequences                                   | `@mionjs/drizzle-orm-<dialect>-core`                       |
| Constraints and indexes, RLS policies and roles, views with explicit columns | `@mionjs/drizzle-orm-<dialect>-core`                       |
| `sql`, `Infer{Select,Insert,Update}Model`, `refineTableType`                 | `@mionjs/drizzle-orm`                                      |
| `toDrizzle`                                                                  | `@mionjs/drizzle-orm-<dialect>-core/drizzle`               |
| Operators, aggregates, set operations, relations                             | `drizzle-orm`                                              |
| Config readers (`getTableConfig`, `getViewConfig`, `isPgEnum`)               | `drizzle-orm/<dialect>-core`                               |
| Provider helpers (`crudPolicy`, supabase roles)                              | `drizzle-orm/<provider>`, pass the result into extraConfig |

**The one exception.** A view built from a query builder (`pgView('v').as(qb => qb.select()...)`) answers yes to question 1 but still cannot be ours: its columns come from drizzle's select typing, the exact generic chain this design removes. Declare it with drizzle over `toDrizzle()` tables. The explicit-column form is ours precisely so a view you want typed in your app can stay slim; its row type is `InferSelectViewModel`, a separate name from the table one exactly as drizzle splits them (a view is read-only).

## In practice

```ts
import {pgTable, uuid, varchar} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {eq} from 'drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {id: uuid().primaryKey(), name: varchar({length: 50}).notNull()});
export type User = InferSelectModel<typeof users>; // no drizzle types anywhere

declare const db: PgDatabase<PgQueryResultHKT>;
const usersDb = toDrizzle(users); // the real drizzle table, built on demand
db.select().from(usersDb).where(eq(usersDb.id, 'some-id'));
```

Coverage is gated by the manifests (`pnpm rtx core drizzle-manifest --check`); the mapping rules and the boundary pass live in the [drizzle-slim-schemas skill](../../.claude/skills/drizzle-slim-schemas/).

An existing drizzle schema moves onto these packages with `ts-runtypes drizzle-migrate` (the same boundary, applied by machine: it splits each declaration into a `X$table` recorder and `X = toDrizzle(X$table)`, and refuses what the table above keeps on drizzle). `ts-runtypes convert --to type` takes it one step further, onto the pure-type road, in either direction. `pnpm rtx release drizzle-e2e` runs drizzle's OWN integration suites through BOTH translations against a real postgres, mysql and sqlite — the only thing that proves a materialized table works against a database rather than against another type.
