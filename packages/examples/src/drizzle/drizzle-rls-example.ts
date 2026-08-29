// Row level security, PostgreSQL only. Roles and policies are recorded like
// everything else, so drizzle-kit sees them in your migrations. None of it
// changes your row types: RLS shapes what the database allows, not what your
// app reads.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import {sql} from '@mionjs/drizzle-orm';

// A role you want drizzle-kit to create.
export const appUser = DB.pgRole('app_user', {createDb: false, createRole: false, inherit: true});

// A role that already exists (a managed one from your provider, say).
// existing() keeps drizzle-kit from trying to create it.
export const authenticated = DB.pgRole('authenticated').existing();

// enableRLS() turns the switch on for the table. Policies declared in the
// third argument belong to this table.
export const documents = DB.pgTable(
  'documents',
  {
    id: DB.uuid('id').defaultRandom().primaryKey(),
    ownerId: DB.uuid('owner_id').notNull(),
    title: DB.varchar('title', {length: 200}).notNull(),
    body: DB.text('body'),
  },
  (t) => [
    DB.index('documents_owner_idx').on(t.ownerId),
    DB.pgPolicy('documents_owner_reads', {
      as: 'permissive',
      for: 'select',
      to: authenticated,
      using: sql`${t.ownerId} = current_setting('app.user_id')::uuid`,
    }),
    DB.pgPolicy('documents_owner_writes', {
      as: 'permissive',
      for: 'insert',
      to: appUser,
      withCheck: sql`${t.ownerId} = current_setting('app.user_id')::uuid`,
    }),
  ]
).enableRLS();

// A policy can also be declared apart from its table and attached with link().
// It belongs to no table's third argument, so export it and materialize it
// yourself (see the schema file example) or drizzle-kit will not see it.
export const adminReadsEverything = DB.pgPolicy('documents_admin_reads', {
  for: 'select',
  to: 'postgres',
  using: sql`true`,
}).link(documents);

// enableRLS() cannot be called twice: the returned type no longer carries it,
// which mirrors drizzle.
// @ts-expect-error RLS is already enabled on this table
export const doubleEnabled = documents.enableRLS();
