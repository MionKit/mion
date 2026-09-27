# @mionjs/drizzle-orm-sqlite-core guidelines

The boundary rule and the import map live in [@mionjs/drizzle-orm's CLAUDE.md](../drizzle-orm/CLAUDE.md). Read that first; everything below is only what is specific to sqlite.

- **The smallest surface of the three**: no row level security, no schemas, no sequences, no identity columns, and no enum function of its own.
- **Enums still give you the literal union**: `text('role', {enum: ['admin', 'user']})` infers `'admin' | 'user'`, same as everywhere else. What sqlite lacks is a standalone enum handle like pg's `pgEnum`.
- **One builder props interface** (`SqliteColIn`): every sqlite column takes the same settings. `integer` and `int` carry the rowid base flag, so any `primaryKey` gives them a database default.
- `primaryKey` also takes sqlite's config form on a column: `primaryKey: [{autoIncrement: true}]`.
- Views are exported twice, as `sqliteView` and the `view` alias, matching drizzle.
- `toDrizzle` is on the `./drizzle` subpath: `@mionjs/drizzle-orm-sqlite-core/drizzle`.

```ts
import {sqliteTable, integer, text} from '@mionjs/drizzle-orm-sqlite-core';

export const notes = sqliteTable('notes', {
  id: integer({primaryKey: [{autoIncrement: true}]}),
  body: text({notNull: true}),
});
```
