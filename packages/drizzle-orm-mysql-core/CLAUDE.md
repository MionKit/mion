# @mionjs/drizzle-orm-mysql-core guidelines

The boundary rule and the import map live in [@mionjs/drizzle-orm's CLAUDE.md](../drizzle-orm/CLAUDE.md). Read that first; everything below is only what is specific to mysql.

- **No row level security**: `pgPolicy` / `pgRole` / `.enableRLS()` have no mysql counterpart.
- **Only mysql has** the `autoincrement` and `onUpdateNow` column settings, `.algorithm()` / `.lock()` on an index (after `.on()`, as in drizzle), and `.algorithm()` / `.sqlSecurity()` / `.withCheckOption()` on a view.
- **Enums still give you the literal union**, same as pg: `mysqlEnum('role', ['admin', 'user'])` infers `'admin' | 'user'`. What mysql has no counterpart for is `pgEnum`'s standalone handle, the reusable object you export for drizzle-kit. Here the values live on the column.
- `mysqlEnum` is builders-only: its runtime needs the values, so `tableFromType` refuses an enum column. Use `text('plan', {enum: [...]})` in a table type, which gives the same union.
- Three builder props interfaces: common (`MysqlColIn`), `+defaultNow` / `+onUpdateNow` (`MysqlTimestampIn`), `+autoincrement` (`MysqlIntIn`).
- `toDrizzle` is on the `./drizzle` subpath: `@mionjs/drizzle-orm-mysql-core/drizzle`.

```ts
import {mysqlTable, int, varchar, index} from '@mionjs/drizzle-orm-mysql-core';

export const users = mysqlTable('users', {id: int({autoincrement: true, primaryKey: true}), name: varchar({length: 50})}, (t) => [
  index('name_idx').on(t.name).algorithm('inplace'),
]);
```
