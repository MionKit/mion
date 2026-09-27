import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {sql, tableRef} from '@mionjs/drizzle-orm';

export const teams = DZ.pgTable('teams', {
  id: DZ.serial('id', {primaryKey: true}),
  slug: DZ.varchar('slug', {length: 40, notNull: true, unique: true}),
});

export const members = DZ.pgTable(
  'members',
  {
    teamId: DZ.integer('team_id', {notNull: true}),
    userId: DZ.uuid('user_id', {notNull: true}),
    email: DZ.varchar('email', {length: 200, notNull: true}),
    age: DZ.integer('age', {notNull: true}),
    joinedAt: DZ.timestamp('joined_at', {notNull: true, defaultNow: true}),
  },
  (t) => [
    DZ.primaryKey({name: 'members_pk', columns: [t.teamId, t.userId]}),

    DZ.foreignKey({
      name: 'members_team_fk',
      columns: [t.teamId],
      foreignColumns: [tableRef(teams, 'id')],
    })
      .onDelete('cascade')
      .onUpdate('restrict'),

    // ordered, and only over some rows
    DZ.index('members_joined_idx')
      .on(t.joinedAt.desc(), t.email)
      .where(sql`${t.age} >= 18`),

    DZ.uniqueIndex('members_email_uidx').on(t.email),
    DZ.unique('members_team_email_uq').on(t.teamId, t.email).nullsNotDistinct(), // nulls count as equal

    DZ.check('members_age_check', sql`${t.age} >= 0`),
  ]
);

// single-column constraints inline, the drizzle way
export const invites = DZ.pgTable('invites', {
  id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
  teamId: DZ.integer('team_id', {references: [() => tableRef(teams, 'id'), {
    onDelete: 'cascade',
  }]}),
  code: DZ.varchar('code', {length: 12, notNull: true, unique: ['invites_code_uq']}),
});
