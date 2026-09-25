/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The side-by-side pg columns at run time: a new builder table, the shipped builder table and raw
// drizzle materialize the same drizzle table; tableFromType rebuilds it from the hand-written type;
// and builder and hand-written tables reflect to one runtype id in both marker call shapes.

import {describe, it, expect} from 'vitest';
import * as dz from 'drizzle-orm/pg-core';
import {getRunTypeId} from '@mionjs/run-types';
import type {InferInsertModel, InferSelectModel} from '../../../drizzle-orm/src/models.ts';
import type * as next from '../../../drizzle-orm/next/index.ts';
import {cols, type SelfRef} from '../../../drizzle-orm/next/index.ts';
import * as cur from '../../src/index.ts';
import {cols as curCols} from '../../../drizzle-orm/src/table.ts';
import {toDrizzle as curToDrizzle} from '../../src/drizzle.ts';
import type {Integer, Jsonb, PgTable, Serial, Text, Timestamp, Uuid, Varchar} from '../../next/index.ts';
import {integer, jsonb, pgTable, serial, tableFromType, text, timestamp, uuid, varchar} from '../../next/index.ts';
import {toDrizzle} from '../../next/drizzle.ts';
import {project} from '../tableSpecShared.ts';

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull().default(21),
  bio: varchar('bio', {length: 500}),
  note: varchar(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
type Users = PgTable<
  'users',
  {
    id: Uuid<{primaryKey: true; defaultRandom: true}>;
    name: Varchar<{length: 100; notNull: true}>;
    age: Integer<{notNull: true; default: [21]}>;
    bio: Varchar<{length: 500}>;
    note: Varchar;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;
const curUsers = cur.pgTable('users', {
  id: cur.uuid('id').primaryKey().defaultRandom(),
  name: cur.varchar('name', {length: 100}).notNull(),
  age: cur.integer('age').notNull().default(21),
  bio: cur.varchar('bio', {length: 500}),
  note: cur.varchar(),
  createdAt: cur.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
const rawUsers = dz.pgTable('users', {
  id: dz.uuid('id').primaryKey().defaultRandom(),
  name: dz.varchar('name', {length: 100}).notNull(),
  age: dz.integer('age').notNull().default(21),
  bio: dz.varchar('bio', {length: 500}),
  note: dz.varchar(),
  createdAt: dz.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});

const wide = pgTable('wide', {
  id: serial('id').primaryKey(),
  role: text('role', {enum: ['free', 'pro']}).notNull(),
  seq: integer('seq').generatedAlwaysAsIdentity(),
  tags: text('tags').array().notNull(),
  meta: jsonb('meta').$type<{tags: string[]}>().notNull(),
  score: integer('score').unique('uq_score'),
});
type Wide = PgTable<
  'wide',
  {
    id: Serial<{primaryKey: true}>;
    role: Text<{enum: ['free', 'pro']; notNull: true}>;
    seq: Integer<{generatedAlwaysAsIdentity: true}>;
    tags: Text<{array: true; notNull: true}>;
    meta: Jsonb<{$type: [{tags: string[]}]; notNull: true}>;
    score: Integer<{unique: ['uq_score']}>;
  }
>;
const curWide = cur.pgTable('wide', {
  id: cur.serial('id').primaryKey(),
  role: cur.text('role', {enum: ['free', 'pro']}).notNull(),
  seq: cur.integer('seq').generatedAlwaysAsIdentity(),
  tags: cur.text('tags').array().notNull(),
  meta: cur.jsonb('meta').$type<{tags: string[]}>().notNull(),
  score: cur.integer('score').unique('uq_score'),
});

const teams = pgTable('teams', {id: serial().primaryKey()});
const members = pgTable('members', {
  id: serial().primaryKey(),
  teamId: integer('team_id').references(() => cols(teams).id, {onDelete: 'cascade'}),
});
type Teams = PgTable<'teams', {id: Serial<{primaryKey: true}>}>;
type Members = PgTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Integer<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
const curTeams = cur.pgTable('teams', {id: cur.serial().primaryKey()});
const curMembers = cur.pgTable('members', {
  id: cur.serial().primaryKey(),
  teamId: cur.integer('team_id').references(() => curCols(curTeams).id, {onDelete: 'cascade'}),
});

const emps = pgTable('emps', {
  id: serial().primaryKey(),
  managerId: integer('manager_id').references((): SelfRef<'emps', 'id'> => cols(emps).id),
});
type Emps = PgTable<
  'emps',
  {id: Serial<{primaryKey: true}>; managerId: Integer<{references: [{table: 'emps'; column: 'id'}]}>},
  [],
  {managerId: 'manager_id'}
>;
const rawEmps = dz.pgTable('emps', {
  id: dz.serial().primaryKey(),
  managerId: dz.integer('manager_id').references((): dz.AnyPgColumn => rawEmps.id),
});

describe('next pg columns: same drizzle table on every road', () => {
  it('new builders, shipped builders and raw drizzle materialize the same table', () => {
    expect(project(toDrizzle(users))).toEqual(project(curToDrizzle(curUsers)));
    expect(project(toDrizzle(users))).toEqual(project(rawUsers));
    expect(project(toDrizzle(wide))).toEqual(project(curToDrizzle(curWide)));
  });
  it('tableFromType rebuilds the same table from the hand-written type, db names from the names map', () => {
    expect(project(toDrizzle(tableFromType<Users>()))).toEqual(project(rawUsers));
    expect(project(toDrizzle(tableFromType<Wide>()))).toEqual(project(curToDrizzle(curWide)));
    expect(toDrizzle<Users>()).toBe(toDrizzle(tableFromType<Users>()));
  });
  it('references resolve through cols() on builders and through options.tables on types', () => {
    expect(project(toDrizzle(members))).toEqual(project(curToDrizzle(curMembers)));
    // Hoisted: a marker call nested in another marker call's arguments gets no id today.
    const teamsType = tableFromType<Teams>();
    const fromTypes = toDrizzle<Members>({tables: {teams: () => teamsType}});
    expect(project(fromTypes)).toEqual(project(curToDrizzle(curMembers)));
  });
  it('a self-reference materializes on both roads', () => {
    expect(project(toDrizzle(emps))).toEqual(project(rawEmps));
    const selfType: object = tableFromType<Emps>({tables: {emps: () => selfType}});
    expect(project(toDrizzle(selfType as Emps))).toEqual(project(rawEmps));
  });
});

describe('next pg columns: one runtype id for builder and hand-written tables', () => {
  // Marker test coverage rule: both getRunTypeId call shapes, paired.
  it('static form: the table and its models share one id', () => {
    expect(getRunTypeId<Users>()).toBeTruthy();
    expect(getRunTypeId<Users>()).toBe(getRunTypeId<typeof users>());
    expect(getRunTypeId<next.InferSelectModel<Users>>()).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
    expect(getRunTypeId<next.InferInsertModel<Wide>>()).toBe(getRunTypeId<InferInsertModel<typeof curWide>>());
  });
  it('reflection form: the table and its models share one id', () => {
    expect(getRunTypeId(users)).toBe(getRunTypeId<Users>());
    const row = {} as next.InferSelectModel<typeof users>;
    expect(getRunTypeId(row)).toBe(getRunTypeId<InferSelectModel<typeof curUsers>>());
  });
});
