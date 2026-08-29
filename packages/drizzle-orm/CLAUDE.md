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

**The one exception.** A view built from a query builder (`pgView('v').as(qb => qb.select()...)`) answers yes to question 1 but still cannot be ours: its columns come from drizzle's select typing, the exact generic chain this design removes. Declare it with drizzle over `toDrizzle()` tables. The explicit-column form is ours precisely so a view you want typed in your app can stay slim.

## In practice

```ts
import {pgTable, uuid, varchar} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import type {InferSelectModel} from '@mionjs/drizzle-orm';
import {eq} from 'drizzle-orm';

export const users = pgTable('users', {id: uuid().primaryKey(), name: varchar({length: 50}).notNull()});
export type User = InferSelectModel<typeof users>; // no drizzle types anywhere

const usersDb = toDrizzle(users); // the real drizzle table, built on demand
db.select().from(usersDb).where(eq(usersDb.id, someId));
```

Coverage is gated by the manifests (`pnpm rtx core drizzle-manifest --check`); the mapping rules and the boundary pass live in the [drizzle-slim-schemas skill](../../.claude/skills/drizzle-slim-schemas/).
