# @mionjs/drizzle-orm-pg-core guidelines

The boundary rule and the import map live in [@mionjs/drizzle-orm's CLAUDE.md](../drizzle-orm/CLAUDE.md). Read that first; everything below is only what is specific to pg.

- **Only pg has row level security**: `pgPolicy`, `pgRole`, and `.enableRLS()` on the table. Policies also go straight into the extraConfig array.
- **Only pg has** identity columns (`generatedAlwaysAsIdentity` / `generatedByDefaultAsIdentity`), sequences (`pgSequence`) and materialized views. mysql has schemas too (`mysqlSchema`); only sqlite has none.
- **`pgEnum` is a standalone handle**, a reusable object you export for drizzle-kit. That handle is pg-only, but enums themselves are not: mysql has `mysqlEnum` and every dialect takes `text('x', {enum: [...]})`, and all of them infer the literal union.
- Four column kind interfaces here, the most of any dialect: common, `+defaultNow`, `+defaultRandom`, `+identity`.
- `toDrizzle` is on the `./drizzle` subpath: `@mionjs/drizzle-orm-pg-core/drizzle`.

```ts
import {pgTable, uuid, text, pgPolicy, index} from '@mionjs/drizzle-orm-pg-core';
import {sql} from '@mionjs/drizzle-orm'; // sql is shared, never from the dialect package

export const docs = pgTable('docs', {id: uuid().primaryKey(), body: text()}, (t) => [
  index('body_idx').on(t.body),
  pgPolicy('owner_only', {for: 'select', using: sql`owner = current_user`}),
]).enableRLS();
```
