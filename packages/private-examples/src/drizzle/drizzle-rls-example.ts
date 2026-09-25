import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {sql} from '@mionjs/drizzle-orm';

export const appUser = DZ.pgRole('app_user', {
  createDb: false,
  createRole: false,
  inherit: true,
});

// a managed role from your provider, say
export const authenticated = DZ.pgRole('authenticated').existing();

export const documents = DZ.pgTable(
  'documents',
  {
    id: DZ.uuid('id').defaultRandom().primaryKey(),
    ownerId: DZ.uuid('owner_id').notNull(),
    title: DZ.varchar('title', {length: 200}).notNull(),
    body: DZ.text('body'),
  },
  (t) => [
    DZ.index('documents_owner_idx').on(t.ownerId),
    DZ.pgPolicy('documents_owner_reads', {
      as: 'permissive',
      for: 'select',
      to: authenticated,
      using: sql`${t.ownerId} = current_setting('app.user_id')::uuid`,
    }),
    DZ.pgPolicy('documents_owner_writes', {
      as: 'permissive',
      for: 'insert',
      to: appUser,
      withCheck: sql`${t.ownerId} = current_setting('app.user_id')::uuid`,
    }),
  ]
).enableRLS();

// needs its own toDrizzle call in the schema file
export const adminReadsEverything = DZ.pgPolicy('documents_admin_reads', {
  for: 'select',
  to: 'postgres',
  using: sql`true`,
}).link(documents);

// @ts-expect-error RLS is already enabled on this table
export const doubleEnabled = documents.enableRLS();
