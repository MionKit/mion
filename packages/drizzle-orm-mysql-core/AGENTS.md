# @mionjs/drizzle-orm-mysql-core guidelines

- Boundary rule, import map, dialect differences: [drizzle-orm AGENTS.md](../drizzle-orm/AGENTS.md). Read first.
- Below: mysql-only detail.

- Column settings only mysql has: `autoincrement`, `onUpdateNow`.
- Index: `.algorithm()` / `.lock()`, after `.on()` as in drizzle.
- View: `.algorithm()` / `.sqlSecurity()` / `.withCheckOption()`.
- `mysqlEnum('role', ['admin', 'user'])` infers `'admin' | 'user'`.
- `mysqlEnum` is builders-only: its runtime needs the values, so `tableFromType` refuses an enum column.
  In a table type use `text('plan', {enum: [...]})`: same union.
- Three builder props interfaces:
  common (`MysqlColIn`), `+defaultNow` / `+onUpdateNow` (`MysqlTimestampIn`), `+autoincrement` (`MysqlIntIn`).
