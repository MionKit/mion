# @mionjs/drizzle-orm-sqlite-core guidelines

The boundary rule and the import map live in [@mionjs/drizzle-orm's CLAUDE.md](../drizzle-orm/CLAUDE.md). Read that first; everything below is only what is specific to sqlite.

- **The smallest surface of the three**: no row level security, no schemas, no standalone enums, no sequences, no identity columns.
- **One column kind interface**, not three or four: every sqlite column takes the same modifier set.
- `primaryKey()` takes sqlite's config form (`{autoIncrement: true}`) on a column.
- Views are exported twice, as `sqliteView` and the `view` alias, matching drizzle.
- `toDrizzle` is on the `./drizzle` subpath: `@mionjs/drizzle-orm-sqlite-core/drizzle`.

```ts
import {sqliteTable, integer, text} from '@mionjs/drizzle-orm-sqlite-core';

export const notes = sqliteTable('notes', {
  id: integer().primaryKey({autoIncrement: true}),
  body: text().notNull(),
});
```
