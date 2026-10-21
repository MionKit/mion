# @mionjs/drizzle-orm-pg-core guidelines

- Boundary rule, import map, dialect differences: [drizzle-orm AGENTS.md](../drizzle-orm/AGENTS.md). Read first.
- Below: pg-only detail.

- RLS: `pgPolicy`, `pgRole`, `.enableRLS()` on the table. Policies go straight into the extraConfig array.
- Identity columns: `generatedAlwaysAsIdentity` / `generatedByDefaultAsIdentity`.
- Four builder props interfaces, most of any dialect:
  common (`PgColIn`), `+defaultNow` (`PgDateIn`), `+defaultRandom` (`PgUuidIn`), `+identity` (`PgIntIn`).
