# @mionjs/drizzle-orm-pg-core guidelines

The boundary rule and the import map live in [@mionjs/drizzle-orm's CLAUDE.md](../drizzle-orm/CLAUDE.md). Read that first; everything below is only what is specific to pg.

- **Only pg has row level security**: `pgPolicy`, `pgRole`, and `.enableRLS()` on the table. Policies also go straight into the extraConfig array.
- **Only pg has identity columns** (`generatedAlwaysAsIdentity` / `generatedByDefaultAsIdentity`), `pgSchema`, `pgSequence`, `pgEnum`, and materialized views.
- Four column kind interfaces here, the most of any dialect: common, `+defaultNow`, `+defaultRandom`, `+identity`.
- `toDrizzle` is on the `./drizzle` subpath: `@mionjs/drizzle-orm-pg-core/drizzle`.

```ts
import {pgTable, uuid, text, pgPolicy, index} from '@mionjs/drizzle-orm-pg-core';

export const docs = pgTable('docs', {id: uuid().primaryKey(), body: text()}, (t) => [
  index('body_idx').on(t.body),
  pgPolicy('owner_only', {for: 'select', using: sql`owner = current_user`}),
]).enableRLS();
```
