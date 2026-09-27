/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the side-by-side sqlite columns (checked by tsc, not executed): a builder table
// IS its hand-written twin, and its models equal the shipped system's models for the same table.

import type {BigInt as RTBigInt, Date as RTDate, Float, Integer as IntegerFormat, String as Str} from '@mionjs/run-types/formats';
import type {DrizzleD1Database} from 'drizzle-orm/d1';
import type {DrizzleSqliteDODatabase} from 'drizzle-orm/durable-sqlite';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';
import type {
  InferInsertModel,
  InferSelectModel,
  InferSelectViewModel,
  InferUpdateModel,
} from '../../../drizzle-orm/src/models.ts';
import type {RefinedTable as CurRefinedTable} from '../../../drizzle-orm/src/refine.ts';
import type {ColSpecOf, KeyFlagsOf, RefinedTable} from '../../../drizzle-orm/next/index.ts';
import {$type, refineTableType, tableRef, type TableRef} from '../../../drizzle-orm/next/index.ts';
import type * as next from '../../../drizzle-orm/next/models.ts';
import {toDrizzle, type ToDrizzleTable} from '../../next/drizzle.ts';
import * as cur from '../../src/index.ts';
import type {Blob, CustomCol, Int, Integer, Numeric, Real, SqliteTable, SqliteView, Text} from '../../next/index.ts';
import {
  blob,
  customType,
  int,
  integer,
  numeric,
  real,
  sqliteTable,
  sqliteTableCreator,
  sqliteView,
  text,
  view,
} from '../../next/index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ── every builder column IS its hand-written column, even outside a table ────

export const looseBlob = blob();
export const looseBlobJson = blob({mode: 'json'});
export const looseBlobBigint = blob({mode: 'bigint', notNull: true});
export const looseInteger = integer({notNull: true, default: [21]});
export const looseIntegerBoolean = integer({mode: 'boolean'});
export const looseIntegerTimestamp = integer({mode: 'timestamp', notNull: true});
export const looseIntegerTimestampMs = integer({mode: 'timestamp_ms'});
export const looseInt = int({primaryKey: true});
export const looseNumeric = numeric();
export const looseNumericNumber = numeric({mode: 'number'});
export const looseNumericBigint = numeric({mode: 'bigint'});
export const looseReal = real({notNull: true, default: [4.5]});
export const looseText = text({length: 100, notNull: true, unique: ['uq_name']});
export const looseTextEnum = text({enum: ['a', 'b']});
export const looseTextJson = text({mode: 'json', $type: $type<{x: number}>()});
export const looseAutoPk = integer({primaryKey: [{autoIncrement: true, onConflict: 'replace'}]});
export const looseGenerated = text({generatedAlwaysAs: ['x', {mode: 'stored'}]});
export const point = customType<{data: {x: number; y: number}}>({dataType: () => 'text'});
export const loosePoint = point({notNull: true});
export type LoosePins = [
  Expect<Equal<typeof looseBlob, Blob>>,
  Expect<Equal<typeof looseBlobJson, Blob<{mode: 'json'}>>>,
  Expect<Equal<typeof looseBlobBigint, Blob<{mode: 'bigint'; notNull: true}>>>,
  Expect<Equal<typeof looseInteger, Integer<{notNull: true; default: [21]}>>>,
  Expect<Equal<typeof looseIntegerBoolean, Integer<{mode: 'boolean'}>>>,
  Expect<Equal<typeof looseIntegerTimestamp, Integer<{mode: 'timestamp'; notNull: true}>>>,
  Expect<Equal<typeof looseIntegerTimestampMs, Integer<{mode: 'timestamp_ms'}>>>,
  Expect<Equal<typeof looseInt, Int<{primaryKey: true}>>>,
  Expect<Equal<typeof looseNumeric, Numeric>>,
  Expect<Equal<typeof looseNumericNumber, Numeric<{mode: 'number'}>>>,
  Expect<Equal<typeof looseNumericBigint, Numeric<{mode: 'bigint'}>>>,
  Expect<Equal<typeof looseReal, Real<{notNull: true; default: [4.5]}>>>,
  Expect<Equal<typeof looseText, Text<{length: 100; notNull: true; unique: ['uq_name']}>>>,
  Expect<Equal<typeof looseTextEnum, Text<{enum: ['a', 'b']}>>>,
  Expect<Equal<typeof looseTextJson, Text<{mode: 'json'; $type: [{x: number}]}>>>,
  Expect<Equal<typeof looseAutoPk, Integer<{primaryKey: [{autoIncrement: true; onConflict: 'replace'}]}>>>,
  Expect<Equal<typeof looseGenerated, Text<{generatedAlwaysAs: ['x', {mode: 'stored'}]}>>>,
  Expect<Equal<typeof loosePoint, CustomCol<{x: number; y: number}, {notNull: true}>>>,
];

// ── the mode sets the data ───────────────────────────────────────────────────

type ModeRow = next.InferSelectModel<
  SqliteTable<
    'modes',
    {
      blobBuffer: Blob<{notNull: true}>;
      blobJson: Blob<{mode: 'json'; notNull: true}>;
      blobBigint: Blob<{mode: 'bigint'; notNull: true}>;
      intNumber: Integer<{notNull: true}>;
      intBoolean: Integer<{mode: 'boolean'; notNull: true}>;
      intTimestamp: Integer<{mode: 'timestamp'; notNull: true}>;
      intTimestampMs: Int<{mode: 'timestamp_ms'; notNull: true}>;
      numString: Numeric<{notNull: true}>;
      numNumber: Numeric<{mode: 'number'; notNull: true}>;
      numBigint: Numeric<{mode: 'bigint'; notNull: true}>;
      real: Real<{notNull: true}>;
      text: Text<{notNull: true}>;
      textLength: Text<{length: 50; notNull: true}>;
      textEnum: Text<{enum: ['a', 'b']; notNull: true}>;
      textJson: Text<{mode: 'json'; notNull: true}>;
    }
  >
>;
export type ModePins = [
  Expect<Equal<ModeRow['blobBuffer'], Buffer>>,
  Expect<Equal<ModeRow['blobJson'], unknown>>,
  Expect<Equal<ModeRow['blobBigint'], RTBigInt>>,
  Expect<Equal<ModeRow['intNumber'], IntegerFormat>>,
  Expect<Equal<ModeRow['intBoolean'], boolean>>,
  Expect<Equal<ModeRow['intTimestamp'], RTDate>>,
  Expect<Equal<ModeRow['intTimestampMs'], RTDate>>,
  Expect<Equal<ModeRow['numString'], string>>,
  Expect<Equal<ModeRow['numNumber'], Float>>,
  Expect<Equal<ModeRow['numBigint'], bigint>>,
  Expect<Equal<ModeRow['real'], Float>>,
  Expect<Equal<ModeRow['text'], Str>>,
  Expect<Equal<ModeRow['textLength'], Str<{maxLength: 50}>>>,
  Expect<Equal<ModeRow['textEnum'], 'a' | 'b'>>,
  Expect<Equal<ModeRow['textJson'], unknown>>,
];

// ── narrow, nameless ─────────────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: integer({primaryKey: [{autoIncrement: true}]}),
  name: text({length: 100, notNull: true}),
  rating: real({notNull: true, default: [4.5]}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  createdAt: integer({mode: 'timestamp', notNull: true}),
});
type Users = SqliteTable<
  'users',
  {
    id: Integer<{primaryKey: [{autoIncrement: true}]}>;
    name: Text<{length: 100; notNull: true}>;
    rating: Real<{notNull: true; default: [4.5]}>;
    role: Text<{enum: ['admin', 'user']; notNull: true}>;
    createdAt: Integer<{mode: 'timestamp'; notNull: true}>;
  }
>;
export const curUsers = cur.sqliteTable('users', {
  id: cur.integer().primaryKey({autoIncrement: true}),
  name: cur.text({length: 100}).notNull(),
  rating: cur.real().notNull().default(4.5),
  role: cur.text({enum: ['admin', 'user']}).notNull(),
  createdAt: cur.integer({mode: 'timestamp'}).notNull(),
});

export type NarrowPins = [
  Expect<Equal<typeof users, Users>>,
  Expect<Equal<next.InferSelectModel<Users>, InferSelectModel<typeof curUsers>>>,
  Expect<Equal<next.InferInsertModel<Users>, InferInsertModel<typeof curUsers>>>,
  Expect<Equal<next.InferUpdateModel<Users>, InferUpdateModel<typeof curUsers>>>,
];

// ── every builder in one table ───────────────────────────────────────────────

export const every = sqliteTable('every', {
  blob: blob({mode: 'json'}),
  customType: point({notNull: true}),
  int: int({default: [1]}),
  integer: integer({mode: 'timestamp_ms'}),
  numeric: numeric({mode: 'bigint'}),
  real: real({unique: true}),
  text: text({length: 10, enum: ['a', 'b']}),
});
type Every = SqliteTable<
  'every',
  {
    blob: Blob<{mode: 'json'}>;
    customType: CustomCol<{x: number; y: number}, {notNull: true}>;
    int: Int<{default: [1]}>;
    integer: Integer<{mode: 'timestamp_ms'}>;
    numeric: Numeric<{mode: 'bigint'}>;
    real: Real<{unique: true}>;
    text: Text<{length: 10; enum: ['a', 'b']}>;
  }
>;
export const curEvery = cur.sqliteTable('every', {
  blob: cur.blob({mode: 'json'}),
  customType: cur
    .customType<{data: {x: number; y: number}}>({dataType: () => 'text'})()
    .notNull(),
  int: cur.int().default(1),
  integer: cur.integer({mode: 'timestamp_ms'}),
  numeric: cur.numeric({mode: 'bigint'}),
  real: cur.real().unique(),
  text: cur.text({length: 10, enum: ['a', 'b']}),
});

export type EveryPins = [
  Expect<Equal<typeof every, Every>>,
  Expect<Equal<next.InferSelectModel<Every>, InferSelectModel<typeof curEvery>>>,
  Expect<Equal<next.InferInsertModel<Every>, InferInsertModel<typeof curEvery>>>,
  Expect<Equal<next.InferUpdateModel<Every>, InferUpdateModel<typeof curEvery>>>,
];

// ── the rowid: an integer primary key is optional on insert, a text one required ──

export const intPk = sqliteTable('int_pk', {id: integer({primaryKey: true}), note: text()});
export const intAliasPk = sqliteTable('int_alias_pk', {id: int({primaryKey: true})});
export const textPk = sqliteTable('text_pk', {id: text({primaryKey: true})});
export const textAutoPk = sqliteTable('text_auto_pk', {id: text({primaryKey: [{autoIncrement: true}]})});
export const curIntPk = cur.sqliteTable('int_pk', {id: cur.integer().primaryKey(), note: cur.text()});
export const curTextPk = cur.sqliteTable('text_pk', {id: cur.text().primaryKey()});
export const curTextAutoPk = cur.sqliteTable('text_auto_pk', {id: cur.text().primaryKey({autoIncrement: true})});
export type OnlySqlite_RowidPins = [
  Expect<Equal<next.InferInsertModel<typeof intPk>, {id?: IntegerFormat; note?: Str | null}>>,
  Expect<Equal<next.InferInsertModel<typeof intPk>, InferInsertModel<typeof curIntPk>>>,
  Expect<Equal<next.InferInsertModel<typeof intAliasPk>, {id?: IntegerFormat}>>,
  Expect<Equal<next.InferInsertModel<typeof textPk>, {id: Str}>>,
  Expect<Equal<next.InferInsertModel<typeof textPk>, InferInsertModel<typeof curTextPk>>>,
  // primaryKey({autoIncrement: true}) gives any column a default, as the shipped kind does.
  Expect<Equal<next.InferInsertModel<typeof textAutoPk>, {id?: Str}>>,
  Expect<Equal<next.InferInsertModel<typeof textAutoPk>, InferInsertModel<typeof curTextAutoPk>>>,
  // Without the primary key the rowid base flag gives no default.
  Expect<Equal<next.InferInsertModel<SqliteTable<'n', {id: Integer<{notNull: true}>}>>, {id: IntegerFormat}>>,
];

// ── the key flags a query builder reads ──────────────────────────────────────

export type KeyFlagPins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<(typeof intPk)['columns']['id']>>['primaryKey'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Text>>['primaryKey'], false>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer<{primaryKey: [{autoIncrement: true}]}>>>['primaryKey'], true>>,
  // drizzle's sqlite never sets isAutoincrement, so the autoIncrement primary key leaves the flag false.
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer<{primaryKey: [{autoIncrement: true}]}>>>['autoincrement'], false>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Text<{$defaultFn: true}>>>['runtimeDefault'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Text>>['runtimeDefault'], false>>,
];

// ── the column flags toDrizzle hands drizzle ─────────────────────────────────

export type ToDrizzleFlagPins = [
  Expect<Equal<ToDrizzleTable<typeof users>['name']['_']['notNull'], true>>,
  Expect<Equal<ToDrizzleTable<typeof intPk>['note']['_']['notNull'], false>>,
  Expect<Equal<ToDrizzleTable<typeof users>['rating']['_']['hasDefault'], true>>,
  Expect<Equal<ToDrizzleTable<typeof users>['name']['_']['hasDefault'], false>>,
  // The rowid: an integer primary key has a default, a text one does not unless it autoIncrements.
  Expect<Equal<ToDrizzleTable<typeof intPk>['id']['_']['hasDefault'], true>>,
  Expect<Equal<ToDrizzleTable<typeof textPk>['id']['_']['hasDefault'], false>>,
  Expect<Equal<ToDrizzleTable<typeof textAutoPk>['id']['_']['hasDefault'], true>>,
];

// ── explicit db names go to the table's names map ────────────────────────────

export const named = sqliteTable('named', {
  id: integer('id', {primaryKey: true}),
  createdAt: integer('created_at', {mode: 'timestamp', notNull: true}),
});
type Named = SqliteTable<
  'named',
  {id: Integer<{primaryKey: true}>; createdAt: Integer<{mode: 'timestamp'; notNull: true}>},
  [],
  {createdAt: 'created_at'}
>;

// The same column shape in two tables is ONE type.
export type NamedPins = [
  Expect<Equal<typeof named, Named>>,
  Expect<Equal<(typeof named)['columns']['id'], (typeof intPk)['columns']['id']>>,
  Expect<Equal<(typeof named)['columns']['createdAt'], Integer<{mode: 'timestamp'; notNull: true}>>>,
];

// ── wide vocabulary ──────────────────────────────────────────────────────────

export const wide = sqliteTable('w', {
  id: integer('id', {primaryKey: [{autoIncrement: true}]}),
  role: text('role', {enum: ['admin', 'user'], notNull: true}),
  payload: text('payload', {mode: 'json', $type: $type<{kind: string}>()}),
  email: text('email', {unique: ['uq_email']}),
  slug: text({notNull: true, $defaultFn: [() => 'slug']}),
  touched: integer({mode: 'timestamp', $onUpdate: [() => new Date()]}),
  derived: text({generatedAlwaysAs: ['x', {mode: 'stored'}]}),
  flag: integer({mode: 'boolean', notNull: true, default: [false]}),
  big: blob({mode: 'bigint'}),
  amount: numeric('amount', {mode: 'number'}),
  code: int('code', {unique: true}),
  createdAt: integer('created_at', {mode: 'timestamp_ms', notNull: true}),
});
type Wide = SqliteTable<
  'w',
  {
    id: Integer<{primaryKey: [{autoIncrement: true}]}>;
    role: Text<{enum: ['admin', 'user']; notNull: true}>;
    payload: Text<{mode: 'json'; $type: [{kind: string}]}>;
    email: Text<{unique: ['uq_email']}>;
    slug: Text<{notNull: true; $defaultFn: true}>;
    touched: Integer<{mode: 'timestamp'; $onUpdate: true}>;
    derived: Text<{generatedAlwaysAs: ['x', {mode: 'stored'}]}>;
    flag: Integer<{mode: 'boolean'; notNull: true; default: [false]}>;
    big: Blob<{mode: 'bigint'}>;
    amount: Numeric<{mode: 'number'}>;
    code: Int<{unique: true}>;
    createdAt: Integer<{mode: 'timestamp_ms'; notNull: true}>;
  },
  [],
  {createdAt: 'created_at'}
>;
export const curWide = cur.sqliteTable('w', {
  id: cur.integer('id').primaryKey({autoIncrement: true}),
  role: cur.text('role', {enum: ['admin', 'user']}).notNull(),
  payload: cur.text('payload', {mode: 'json'}).$type<{kind: string}>(),
  email: cur.text('email').unique('uq_email'),
  slug: cur
    .text()
    .notNull()
    .$defaultFn(() => 'slug'),
  touched: cur.integer({mode: 'timestamp'}).$onUpdate(() => new Date()),
  derived: cur.text().generatedAlwaysAs('x', {mode: 'stored'}),
  flag: cur.integer({mode: 'boolean'}).notNull().default(false),
  big: cur.blob({mode: 'bigint'}),
  amount: cur.numeric('amount', {mode: 'number'}),
  code: cur.int('code').unique(),
  createdAt: cur.integer('created_at', {mode: 'timestamp_ms'}).notNull(),
});

export type WidePins = [
  Expect<Equal<typeof wide, Wide>>,
  Expect<Equal<next.InferSelectModel<Wide>, InferSelectModel<typeof curWide>>>,
  Expect<Equal<next.InferInsertModel<Wide>, InferInsertModel<typeof curWide>>>,
  Expect<Equal<next.InferUpdateModel<Wide>, InferUpdateModel<typeof curWide>>>,
  // A runtime default or an update hook makes the column optional on insert; a generated one leaves insert.
  Expect<Equal<next.InferInsertModel<Wide>['slug'], Str | undefined>>,
  Expect<Equal<next.InferInsertModel<Wide>['touched'], RTDate | null | undefined>>,
  Expect<Equal<'derived' extends keyof next.InferInsertModel<Wide> ? true : false, false>>,
];

// ── a builder table through the drizzle database type ────────────────────────

declare const sqliteDb: BaseSQLiteDatabase<'async', unknown>;
declare const newUser: next.InferInsertModel<typeof users>;
declare const userPatch: next.InferUpdateModel<typeof users>;
export const usersQuery = sqliteDb.select().from(toDrizzle(users));
type UserRows = Awaited<typeof usersQuery>;
export const usersInsert = sqliteDb.insert(toDrizzle(users)).values(newUser);
export const usersUpdate = sqliteDb.update(toDrizzle(users)).set(userPatch);
export type QueryPins = [
  Expect<Equal<keyof UserRows[number], 'id' | 'name' | 'rating' | 'role' | 'createdAt'>>,
  Expect<Equal<UserRows[number]['name'], string>>,
  Expect<Equal<UserRows[number]['createdAt'], Date>>,
  Expect<Equal<UserRows[number]['role'], 'admin' | 'user'>>,
];

// ── the columns callback and the table creator give the same type ────────────

export const byCallback = sqliteTable('users', (helpers) => ({
  id: helpers.integer({primaryKey: [{autoIncrement: true}]}),
  name: helpers.text({length: 100, notNull: true}),
  rating: helpers.real({notNull: true, default: [4.5]}),
  role: helpers.text({enum: ['admin', 'user'], notNull: true}),
  createdAt: helpers.integer({mode: 'timestamp', notNull: true}),
}));
export const prefixed = sqliteTableCreator((name) => `app_${name}`);
export const createdUsers = prefixed('users', {
  id: integer({primaryKey: [{autoIncrement: true}]}),
  name: text({length: 100, notNull: true}),
  rating: real({notNull: true, default: [4.5]}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  createdAt: integer({mode: 'timestamp', notNull: true}),
});
export type CreatorPins = [Expect<Equal<typeof byCallback, Users>>, Expect<Equal<typeof createdUsers, Users>>];

// ── references, across tables and to itself ──────────────────────────────────

export const teams = sqliteTable('teams', {id: integer({primaryKey: true})});
export const members = sqliteTable('members', {
  id: integer({primaryKey: true}),
  teamId: integer('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
});
type Members = SqliteTable<
  'members',
  {
    id: Integer<{primaryKey: true}>;
    teamId: Integer<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>;
  },
  [],
  {teamId: 'team_id'}
>;
export const emps = sqliteTable('emps', {
  id: integer({primaryKey: true}),
  managerId: integer({references: [(): TableRef<'emps', 'id'> => tableRef(emps, 'id')]}),
});
type Emps = SqliteTable<
  'emps',
  {id: Integer<{primaryKey: true}>; managerId: Integer<{references: [{table: 'emps'; column: 'id'}]}>}
>;

type MembersByRef = SqliteTable<
  'members',
  {id: Integer<{primaryKey: true}>; teamId: Integer<{references: [TableRef<typeof teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
type EmpsByRef = SqliteTable<
  'emps',
  {id: Integer<{primaryKey: true}>; managerId: Integer<{references: [TableRef<'emps', 'id'>]}>}
>;

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

// ── views, under both names ──────────────────────────────────────────────────

export const activeView = sqliteView('active', {name: text('user_name', {length: 10, notNull: true}), note: text()}).existing();
export const aliasView = view('active', {name: text('user_name', {length: 10, notNull: true}), note: text()}).existing();
type ActiveView = SqliteView<'active', {name: Text<{length: 10; notNull: true}>; note: Text}, {name: 'user_name'}>;
export const curActiveView = cur
  .sqliteView('active', {name: cur.text('user_name', {length: 10}).notNull(), note: cur.text()})
  .existing();

export type ViewPins = [
  Expect<Equal<typeof activeView, ActiveView>>,
  Expect<Equal<typeof aliasView, ActiveView>>,
  Expect<Equal<next.InferSelectViewModel<ActiveView>, InferSelectViewModel<typeof curActiveView>>>,
  Expect<Equal<next.InferSelectViewModel<ActiveView>, {name: Str<{maxLength: 10}>; note: Str | null}>>,
];
// @ts-expect-error the query-builder form has no columns to type, so it has no as()
export const noAs = sqliteView('from_query').as;

// ── refine keeps every column fact, key flags included ───────────────────────

type RefinedUsers = RefinedTable<Users, {name: {maxLength: 50}}>;
export type RefinePins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['primaryKey'], true>>,
  Expect<Equal<next.InferSelectModel<RefinedUsers>, InferSelectModel<CurRefinedTable<typeof curUsers, {name: {maxLength: 50}}>>>>,
  Expect<Equal<next.InferInsertModel<RefinedUsers>, InferInsertModel<CurRefinedTable<typeof curUsers, {name: {maxLength: 50}}>>>>,
];

// ── toDrizzle names columns as drizzle does, on BOTH roads ────────────────────

export type DbNamePins = [
  Expect<Equal<ToDrizzleTable<typeof named>['createdAt']['_']['name'], 'created_at'>>,
  Expect<Equal<ToDrizzleTable<Named>['id']['_']['name'], 'id'>>,
  Expect<Equal<keyof DzInferSelectModel<ToDrizzleTable<Named>, {dbColumnNames: true}>, 'id' | 'created_at'>>,
];

// ── the two Cloudflare storage drivers ───────────────────────────────────────
// Both drivers take sqlite-core tables; the pin is that a builder table works through each query builder.

export const cfNotes = sqliteTable('cf_notes', {
  id: integer('id', {primaryKey: [{autoIncrement: true}]}),
  title: text('title', {length: 120, notNull: true}),
  createdAt: integer('created_at', {mode: 'timestamp', notNull: true}),
});
const cfApi = refineTableType(cfNotes, {title: {minLength: 3}});
const dzCfNotes = toDrizzle(cfApi);
type CfNote = next.InferSelectModel<typeof cfApi>;
type NewCfNote = next.InferInsertModel<typeof cfApi>;
type CfNotePatch = next.InferUpdateModel<typeof cfApi>;
declare const newCfNote: NewCfNote;
declare const cfNotePatch: CfNotePatch;

// D1, the binding a Worker gets from `env.DB`.
declare const d1Db: DrizzleD1Database;
export const d1Query = d1Db.select().from(dzCfNotes);
type D1Rows = Awaited<typeof d1Query>;
declare const d1Rows: D1Rows;
export const d1RowIntoModel: CfNote = d1Rows[0]!;
export const d1InsertFromModel = d1Db.insert(dzCfNotes).values(newCfNote);
export const d1UpdateFromModel = d1Db.update(dzCfNotes).set(cfNotePatch);

// Durable Objects SQLite, reached through `ctx.storage` inside the object.
declare const doDb: DrizzleSqliteDODatabase;
export const doQuery = doDb.select().from(dzCfNotes);
type DoRows = Awaited<typeof doQuery>;
declare const doRows: DoRows;
export const doRowIntoModel: CfNote = doRows[0]!;
export const doInsertFromModel = doDb.insert(dzCfNotes).values(newCfNote);
export const doUpdateFromModel = doDb.update(dzCfNotes).set(cfNotePatch);

export type OnlySqlite_CloudflarePins = [
  Expect<Equal<D1Rows[number]['title'], string>>,
  Expect<Equal<D1Rows[number]['createdAt'], Date>>,
  Expect<Equal<DoRows[number]['title'], string>>,
  Expect<Equal<DoRows[number]['createdAt'], Date>>,
  Expect<Equal<NewCfNote['id'], IntegerFormat | undefined>>,
];

// ── wrong settings are rejected ──────────────────────────────────────────────

// @ts-expect-error a stray key is rejected in a call
integer({notNull: true, defaultNow: true});
// @ts-expect-error a stray key is rejected in a column type
export type BadStrayKey = Text<{notNull: true; defaultNow: true}>;
// @ts-expect-error a stray key is rejected in a named call
integer('id', {notNull: true, defaultNow: true});
// @ts-expect-error another dialect's modifier is rejected
text({array: true});
// @ts-expect-error only sqlite: defaultNow is rejected in a column type
export type BadDefaultNow = Text<{defaultNow: true}>;
// @ts-expect-error only sqlite: defaultNow is rejected in a call
integer({defaultNow: true});
// @ts-expect-error only sqlite: autoincrement is spelled as an autoIncrement primary key, in a column type
export type BadAutoincrement = Integer<{autoincrement: true}>;
// @ts-expect-error only sqlite: autoincrement is spelled as an autoIncrement primary key, in a call
integer({autoincrement: true});
// @ts-expect-error only sqlite: autoincrement is rejected beside a primary key too
integer({primaryKey: true, autoincrement: true});
// @ts-expect-error only sqlite: unique takes a name only
text({unique: ['uq', {nulls: 'distinct'}]});
// @ts-expect-error only sqlite: real takes no mode
real({mode: 'number'});
// @ts-expect-error a references() target must be a tableRef(), which records its table
integer({references: [() => users]});
