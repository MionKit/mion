// Constraints and indexes go in the table's third argument, exactly as in
// drizzle: a callback that receives the columns and returns an array. None of
// this reaches your app types, it only shapes the SQL, so it costs your models
// nothing.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import {cols, sql} from '@mionjs/drizzle-orm';

export const teams = DB.pgTable('teams', {
  id: DB.serial('id').primaryKey(),
  slug: DB.varchar('slug', {length: 40}).notNull().unique(),
});

export const members = DB.pgTable(
  'members',
  {
    teamId: DB.integer('team_id').notNull(),
    userId: DB.uuid('user_id').notNull(),
    email: DB.varchar('email', {length: 200}).notNull(),
    age: DB.integer('age').notNull(),
    joinedAt: DB.timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => [
    // a composite primary key over two columns
    DB.primaryKey({name: 'members_pk', columns: [t.teamId, t.userId]}),

    // a foreign key with referential actions
    DB.foreignKey({name: 'members_team_fk', columns: [t.teamId], foreignColumns: [cols(teams).id]})
      .onDelete('cascade')
      .onUpdate('restrict'),

    // a plain index, ordered, and only over some rows
    DB.index('members_joined_idx')
      .on(t.joinedAt.desc(), t.email)
      .where(sql`${t.age} >= 18`),

    // a unique index, and a unique constraint that treats nulls as equal
    DB.uniqueIndex('members_email_uidx').on(t.email),
    DB.unique('members_team_email_uq').on(t.teamId, t.email).nullsNotDistinct(),

    // a check constraint
    DB.check('members_age_check', sql`${t.age} >= 0`),
  ]
);

// A single column can also carry its constraints inline, the drizzle way.
export const invites = DB.pgTable('invites', {
  id: DB.uuid('id').defaultRandom().primaryKey(),
  teamId: DB.integer('team_id').references(() => cols(teams).id, {onDelete: 'cascade'}),
  code: DB.varchar('code', {length: 12}).notNull().unique('invites_code_uq'),
});
