/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the side-by-side pg columns (checked by tsc, not executed): a builder table
// IS its hand-written twin, and its models equal the shipped system's models for the same table.

import type {InferInsertModel, InferSelectModel, InferUpdateModel} from '../../../drizzle-orm/src/models.ts';
import type * as next from '../../../drizzle-orm/next/models.ts';
import {cols, type SelfRef} from '../../../drizzle-orm/next/index.ts';
import * as cur from '../../src/index.ts';
import type {Integer, Jsonb, PgTable, Serial, Text, Timestamp, Uuid, Varchar} from '../../next/index.ts';
import {integer, jsonb, pgTable, serial, text, timestamp, uuid, varchar} from '../../next/index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ── narrow, nameless ─────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid().primaryKey(),
  name: varchar({length: 100}).notNull(),
  age: integer().notNull(),
  role: text({enum: ['admin', 'user']}).notNull(),
  createdAt: timestamp({mode: 'date'}).notNull().defaultNow(),
});
type Users = PgTable<
  'users',
  {
    id: Uuid<{primaryKey: true}>;
    name: Varchar<{length: 100; notNull: true}>;
    age: Integer<{notNull: true}>;
    role: Text<{enum: ['admin', 'user']; notNull: true}>;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
  }
>;
export const curUsers = cur.pgTable('users', {
  id: cur.uuid().primaryKey(),
  name: cur.varchar({length: 100}).notNull(),
  age: cur.integer().notNull(),
  role: cur.text({enum: ['admin', 'user']}).notNull(),
  createdAt: cur.timestamp({mode: 'date'}).notNull().defaultNow(),
});

export type NarrowPins = [
  Expect<Equal<typeof users, Users>>,
  Expect<Equal<next.InferSelectModel<Users>, InferSelectModel<typeof curUsers>>>,
  Expect<Equal<next.InferInsertModel<Users>, InferInsertModel<typeof curUsers>>>,
  Expect<Equal<next.InferUpdateModel<Users>, InferUpdateModel<typeof curUsers>>>,
];

// ── explicit db names go to the table's names map ────────────────────────────

export const named = pgTable('named', {
  id: integer('id').primaryKey(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull(),
});
type Named = PgTable<
  'named',
  {id: Integer<{primaryKey: true}>; createdAt: Timestamp<{mode: 'date'; notNull: true}>},
  [],
  {createdAt: 'created_at'}
>;

// The same column shape in two tables is ONE type.
export type NamedPins = [
  Expect<Equal<typeof named, Named>>,
  Expect<Equal<(typeof named)['columns']['id'], Integer<{primaryKey: true}>>>,
  Expect<Equal<(typeof named)['columns']['createdAt'], Timestamp<{mode: 'date'; notNull: true}>>>,
];

// ── wide vocabulary ──────────────────────────────────────────────────────────

export const wide = pgTable('w', {
  id: serial('id').primaryKey(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  seq: integer('seq').generatedAlwaysAsIdentity(),
  tags: text('tags').array().notNull(),
  payload: jsonb('payload').$type<{kind: string}>(),
  email: text('email').unique('uq_email'),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
type Wide = PgTable<
  'w',
  {
    id: Serial<{primaryKey: true}>;
    role: Text<{enum: ['admin', 'user']; notNull: true}>;
    seq: Integer<{generatedAlwaysAsIdentity: true}>;
    tags: Text<{array: true; notNull: true}>;
    payload: Jsonb<{$type: [{kind: string}]}>;
    email: Text<{unique: ['uq_email']}>;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;
export const curWide = cur.pgTable('w', {
  id: cur.serial('id').primaryKey(),
  role: cur.text('role', {enum: ['admin', 'user']}).notNull(),
  seq: cur.integer('seq').generatedAlwaysAsIdentity(),
  tags: cur.text('tags').array().notNull(),
  payload: cur.jsonb('payload').$type<{kind: string}>(),
  email: cur.text('email').unique('uq_email'),
  createdAt: cur.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});

export type WidePins = [
  Expect<Equal<typeof wide, Wide>>,
  Expect<Equal<next.InferSelectModel<Wide>, InferSelectModel<typeof curWide>>>,
  Expect<Equal<next.InferInsertModel<Wide>, InferInsertModel<typeof curWide>>>,
  Expect<Equal<next.InferUpdateModel<Wide>, InferUpdateModel<typeof curWide>>>,
];

// ── references, across tables and to itself ──────────────────────────────────

export const teams = pgTable('teams', {id: serial().primaryKey()});
export const members = pgTable('members', {
  id: serial().primaryKey(),
  teamId: integer('team_id').references(() => cols(teams).id, {onDelete: 'cascade'}),
});
type Members = PgTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Integer<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
export const emps = pgTable('emps', {
  id: serial().primaryKey(),
  managerId: integer().references((): SelfRef<'emps', 'id'> => cols(emps).id),
});
type Emps = PgTable<'emps', {id: Serial<{primaryKey: true}>; managerId: Integer<{references: [{table: 'emps'; column: 'id'}]}>}>;

export type RefPins = [Expect<Equal<typeof members, Members>>, Expect<Equal<typeof emps, Emps>>];

// ── wrong modifiers are rejected ─────────────────────────────────────────────

// @ts-expect-error varchar has no defaultNow
export type BadMod = Varchar<{defaultNow: true}>;
// @ts-expect-error only int kinds have identity
varchar().generatedAlwaysAsIdentity();
