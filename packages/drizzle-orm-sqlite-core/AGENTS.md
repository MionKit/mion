# @mionjs/drizzle-orm-sqlite-core guidelines

- Boundary rule, import map, dialect differences: [drizzle-orm AGENTS.md](../drizzle-orm/AGENTS.md). Read first.
- Below: sqlite-only detail.

- Smallest surface of the three: no RLS, schemas, sequences, identity columns or enum function.
- Enum literal union: `text('role', {enum: ['admin', 'user']})` infers `'admin' | 'user'`.
- One builder props interface (`SqliteColIn`): every sqlite column takes the same settings.
- `integer` and `int` carry the rowid base flag: any `primaryKey` gives them a database default.
- `primaryKey` also takes sqlite's config form on a column: `primaryKey: [{autoIncrement: true}]`.
- Views exported twice, `sqliteView` and the `view` alias, matching drizzle.
