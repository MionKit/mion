// Constraints and indexes go in the table's third argument, exactly as in
// drizzle: a callback that receives the columns and returns an array. None of
// this reaches your app types, it only shapes the SQL, so it costs your models
// nothing.
import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {cols, sql} from '@mionjs/drizzle-orm';

export const teams = DZ.pgTable('teams', {
  id: DZ.serial('id').primaryKey(),
  slug: DZ.varchar('slug', {length: 40}).notNull().unique(),
});

export const members = DZ.pgTable(
  'members',
  {
    teamId: DZ.integer('team_id').notNull(),
    userId: DZ.uuid('user_id').notNull(),
    email: DZ.varchar('email', {length: 200}).notNull(),
    age: DZ.integer('age').notNull(),
    joinedAt: DZ.timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => [
    // a composite primary key over two columns
    DZ.primaryKey({name: 'members_pk', columns: [t.teamId, t.userId]}),

    // a foreign key with referential actions
    DZ.foreignKey({
      name: 'members_team_fk',
      columns: [t.teamId],
      foreignColumns: [cols(teams).id],
    })
      .onDelete('cascade')
      .onUpdate('restrict'),

    // a plain index, ordered, and only over some rows
    DZ.index('members_joined_idx')
      .on(t.joinedAt.desc(), t.email)
      .where(sql`${t.age} >= 18`),

    // a unique index, and a unique constraint that treats nulls as equal
    DZ.uniqueIndex('members_email_uidx').on(t.email),
    DZ.unique('members_team_email_uq').on(t.teamId, t.email).nullsNotDistinct(),

    // a check constraint
    DZ.check('members_age_check', sql`${t.age} >= 0`),
  ]
);

// A single column can also carry its constraints inline, the drizzle way.
export const invites = DZ.pgTable('invites', {
  id: DZ.uuid('id').defaultRandom().primaryKey(),
  teamId: DZ.integer('team_id').references(() => cols(teams).id, {
    onDelete: 'cascade',
  }),
  code: DZ.varchar('code', {length: 12}).notNull().unique('invites_code_uq'),
});
