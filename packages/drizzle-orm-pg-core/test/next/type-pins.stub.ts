/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the side-by-side pg columns (checked by tsc, not executed): a builder table
// IS its hand-written twin, and its models equal the shipped system's models for the same table.

import type {
  InferInsertModel,
  InferSelectModel,
  InferSelectViewModel,
  InferUpdateModel,
} from '../../../drizzle-orm/src/models.ts';
import type {RefinedTable as CurRefinedTable} from '../../../drizzle-orm/src/refine.ts';
import type {ColSpecOf, KeyFlagsOf, RefinedTable} from '../../../drizzle-orm/next/index.ts';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import type {ToDrizzleTable} from '../../next/drizzle.ts';
import type * as next from '../../../drizzle-orm/next/models.ts';
import {$type, tableRef, type TableRef} from '../../../drizzle-orm/next/index.ts';
import * as cur from '../../src/index.ts';
import type {Integer, Jsonb, PgEnumCol, PgTable, PgView, Serial, Text, Timestamp, Uuid, Varchar} from '../../next/index.ts';
import {integer, jsonb, pgEnum, pgTable, pgView, serial, text, timestamp, uuid, varchar} from '../../next/index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ── narrow, nameless ─────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid({primaryKey: true}),
  name: varchar({length: 100, notNull: true}),
  age: integer({notNull: true}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  createdAt: timestamp({mode: 'date', notNull: true, defaultNow: true}),
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

// With one call per column, a builder column IS the hand-written column, even outside a table.
export const looseVarchar = varchar({length: 100, notNull: true, unique: ['uq_name', {nulls: 'not distinct'}]});
export const looseInteger = integer({notNull: true, default: [21]});
export type LoosePins = [
  Expect<Equal<typeof looseVarchar, Varchar<{length: 100; notNull: true; unique: ['uq_name', {nulls: 'not distinct'}]}>>>,
  Expect<Equal<typeof looseInteger, Integer<{notNull: true; default: [21]}>>>,
];

export type NarrowPins = [
  Expect<Equal<typeof users, Users>>,
  Expect<Equal<next.InferSelectModel<Users>, InferSelectModel<typeof curUsers>>>,
  Expect<Equal<next.InferInsertModel<Users>, InferInsertModel<typeof curUsers>>>,
  Expect<Equal<next.InferUpdateModel<Users>, InferUpdateModel<typeof curUsers>>>,
];

// ── explicit db names go to the table's names map ────────────────────────────

export const named = pgTable('named', {
  id: integer('id', {primaryKey: true}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true}),
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
  id: serial('id', {primaryKey: true}),
  role: text('role', {enum: ['admin', 'user'], notNull: true}),
  seq: integer('seq', {generatedAlwaysAsIdentity: true}),
  tags: text('tags', {array: true, notNull: true}),
  payload: jsonb('payload', {$type: $type<{kind: string}>()}),
  email: text('email', {unique: ['uq_email']}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),
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

export const teams = pgTable('teams', {id: serial({primaryKey: true})});
export const members = pgTable('members', {
  id: serial({primaryKey: true}),
  teamId: integer('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
});
type Members = PgTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Integer<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
export const emps = pgTable('emps', {
  id: serial({primaryKey: true}),
  managerId: integer({references: [(): TableRef<'emps', 'id'> => tableRef(emps, 'id')]}),
});
type Emps = PgTable<'emps', {id: Serial<{primaryKey: true}>; managerId: Integer<{references: [{table: 'emps'; column: 'id'}]}>}>;

type MembersByRef = PgTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Integer<{references: [TableRef<typeof teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
type EmpsByRef = PgTable<'emps', {id: Serial<{primaryKey: true}>; managerId: Integer<{references: [TableRef<'emps', 'id'>]}>}>;

export type RefPins = [
  Expect<Equal<typeof members, Members>>,
  Expect<Equal<typeof emps, Emps>>,
  Expect<Equal<MembersByRef, Members>>,
  Expect<Equal<EmpsByRef, Emps>>,
];
// @ts-expect-error TableRef checks the column exists
export type BadRefColumn = TableRef<typeof teams, 'idd'>;
// @ts-expect-error tableRef() checks the column exists
tableRef(teams, 'idd');

// ── views, enums ─────────────────────────────────────────────────────────────

export const activeView = pgView('active', {name: varchar('user_name', {length: 10, notNull: true})}).existing();
type ActiveView = PgView<'active', {name: Varchar<{length: 10; notNull: true}>}, {name: 'user_name'}>;
export const curActiveView = cur.pgView('active', {name: cur.varchar('user_name', {length: 10}).notNull()}).existing();
export const mood = pgEnum('mood', ['sad', 'happy']);
export const withEnum = pgTable('with_enum', {mood: mood({notNull: true})});
type WithEnum = PgTable<'with_enum', {mood: PgEnumCol<['sad', 'happy'], {notNull: true}>}>;

export type ViewEnumPins = [
  Expect<Equal<typeof activeView, ActiveView>>,
  Expect<Equal<next.InferSelectViewModel<ActiveView>, InferSelectViewModel<typeof curActiveView>>>,
  Expect<Equal<typeof withEnum, WithEnum>>,
  Expect<Equal<next.InferSelectModel<WithEnum>, {mood: 'sad' | 'happy'}>>,
];

// ── refine keeps every column fact, key flags included ───────────────────────

type RefinedUsers = RefinedTable<Users, {name: {maxLength: 50}}>;
export type RefinePins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['primaryKey'], true>>,
  Expect<Equal<next.InferSelectModel<RefinedUsers>, InferSelectModel<CurRefinedTable<typeof curUsers, {name: {maxLength: 50}}>>>>,
  Expect<Equal<next.InferInsertModel<RefinedUsers>, InferInsertModel<CurRefinedTable<typeof curUsers, {name: {maxLength: 50}}>>>>,
];

// ── toDrizzle names columns as drizzle does, on BOTH roads ────────────────────
// The names map is on the table, so a builder table gets its db names back too.

export type DbNamePins = [
  Expect<Equal<ToDrizzleTable<typeof named>['createdAt']['_']['name'], 'created_at'>>,
  Expect<Equal<ToDrizzleTable<Named>['id']['_']['name'], 'id'>>,
  Expect<Equal<keyof DzInferSelectModel<ToDrizzleTable<Named>, {dbColumnNames: true}>, 'id' | 'created_at'>>,
];

// ── wrong modifiers are rejected ─────────────────────────────────────────────

// @ts-expect-error varchar has no defaultNow
export type BadMod = Varchar<{defaultNow: true}>;
// @ts-expect-error only int kinds have identity
varchar({generatedAlwaysAsIdentity: true});
// @ts-expect-error a references() target must be a tableRef(), which records its table
integer({references: [() => users]});
