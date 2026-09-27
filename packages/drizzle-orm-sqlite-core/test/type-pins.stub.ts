/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the sqlite columns (checked by tsc, not executed): a builder table IS its hand-written twin,
// its models equal the models the chained system produced for the same table, and its queries type as raw drizzle's.

import type {
  BigInt as RTBigInt,
  Date as RTDate,
  Float,
  Integer as IntegerFormat,
  MergeFormat,
  String as Str,
} from '@mionjs/run-types/formats';
import type {
  ColSpecOf,
  InferInsertModel,
  InferSelectModel,
  InferSelectViewModel,
  InferUpdateModel,
  KeyFlagsOf,
  RefinedTable,
} from '@mionjs/drizzle-orm';
import {$type, refineTableType, sql, tableRef, type TableRef} from '@mionjs/drizzle-orm';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import type {DrizzleD1Database} from 'drizzle-orm/d1';
import type {DrizzleSqliteDODatabase} from 'drizzle-orm/durable-sqlite';
import * as dz from 'drizzle-orm/sqlite-core';
import type {BaseSQLiteDatabase} from 'drizzle-orm/sqlite-core';
import type {ToDrizzleTable} from '../src/drizzle.ts';
import {toDrizzle} from '../src/drizzle.ts';
import type {Blob, CustomCol, Int, Integer, Numeric, Real, SqliteTable, SqliteView, Text} from '../src/index.ts';
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
} from '../src/index.ts';

// ── the models the chained system produced, captured before the switch ────────

type EveryInsertBefore = {
  customType: {x: number; y: number};
  blob?: unknown;
  int?: IntegerFormat | null | undefined;
  integer?: RTDate | null | undefined;
  numeric?: bigint | null | undefined;
  real?: Float | null | undefined;
  text?: 'a' | 'b' | null | undefined;
};
type IntPkInsertBefore = {id?: IntegerFormat | undefined; note?: Str | null | undefined};
type TextAutoPkInsertBefore = {id?: Str | undefined};
type TextPkInsertBefore = {id: Str};
type UsersInsertBefore = {
  name: Str<{maxLength: 100}>;
  role: 'admin' | 'user';
  createdAt: RTDate;
  id?: IntegerFormat | undefined;
  rating?: Float | undefined;
};
type WideInsertBefore = {
  role: 'admin' | 'user';
  createdAt: RTDate;
  id?: IntegerFormat | undefined;
  payload?: {kind: string} | null | undefined;
  email?: Str | null | undefined;
  slug?: Str | undefined;
  touched?: RTDate | null | undefined;
  flag?: boolean | undefined;
  big?: RTBigInt | null | undefined;
  amount?: Float | null | undefined;
  code?: IntegerFormat | null | undefined;
};
type EverySelectBefore = {
  blob: unknown;
  customType: {x: number; y: number};
  int: IntegerFormat | null;
  integer: RTDate | null;
  numeric: bigint | null;
  real: Float | null;
  text: 'a' | 'b' | null;
};
type UsersSelectBefore = {
  id: IntegerFormat;
  name: Str<{maxLength: 100}>;
  rating: Float;
  role: 'admin' | 'user';
  createdAt: RTDate;
};
type WideSelectBefore = {
  id: IntegerFormat;
  role: 'admin' | 'user';
  payload: {kind: string} | null;
  email: Str | null;
  slug: Str;
  touched: RTDate | null;
  derived: Str | null;
  flag: boolean;
  big: RTBigInt | null;
  amount: Float | null;
  code: IntegerFormat | null;
  createdAt: RTDate;
};
type ActiveViewViewSelectBefore = {name: Str<{maxLength: 10}>; note: Str | null};
type EveryUpdateBefore = {
  blob?: unknown;
  customType?: {x: number; y: number} | undefined;
  int?: IntegerFormat | null | undefined;
  integer?: RTDate | null | undefined;
  numeric?: bigint | null | undefined;
  real?: Float | null | undefined;
  text?: 'a' | 'b' | null | undefined;
};
type UsersUpdateBefore = {
  id?: IntegerFormat | undefined;
  name?: Str<{maxLength: 100}> | undefined;
  rating?: Float | undefined;
  role?: 'admin' | 'user' | undefined;
  createdAt?: RTDate | undefined;
};
type WideUpdateBefore = {
  id?: IntegerFormat | undefined;
  role?: 'admin' | 'user' | undefined;
  payload?: {kind: string} | null | undefined;
  email?: Str | null | undefined;
  slug?: Str | undefined;
  touched?: RTDate | null | undefined;
  flag?: boolean | undefined;
  big?: RTBigInt | null | undefined;
  amount?: Float | null | undefined;
  code?: IntegerFormat | null | undefined;
  createdAt?: RTDate | undefined;
};
type UsersRefinedInsertBefore = {
  name: MergeFormat<Str<{maxLength: 100}>, {maxLength: 50}>;
  role: 'admin' | 'user';
  createdAt: RTDate;
  id?: IntegerFormat | undefined;
  rating?: Float | undefined;
};
type UsersRefinedSelectBefore = {
  id: IntegerFormat;
  name: MergeFormat<Str<{maxLength: 100}>, {maxLength: 50}>;
  rating: Float;
  role: 'admin' | 'user';
  createdAt: RTDate;
};

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type DataOf<C> = ColSpecOf<C> extends {data: infer D} ? D : never;

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
export const rawUsers = dz.sqliteTable('users', {
  id: dz.integer().primaryKey({autoIncrement: true}),
  name: dz.text({length: 100}).notNull(),
  rating: dz.real().notNull().default(4.5),
  role: dz.text({enum: ['admin', 'user']}).notNull(),
  createdAt: dz.integer({mode: 'timestamp'}).notNull(),
});

// With one call per column, a builder column IS the hand-written column, even outside a table.
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

export type NarrowPins = [
  Expect<Equal<typeof users, Users>>,
  Expect<Equal<InferSelectModel<Users>, UsersSelectBefore>>,
  Expect<Equal<InferInsertModel<Users>, UsersInsertBefore>>,
  Expect<Equal<InferUpdateModel<Users>, UsersUpdateBefore>>,
];

// ── mode and config pick the data type ───────────────────────────────────────

export const modes = {
  blobBuffer: blob(),
  blobJson: blob({mode: 'json'}),
  blobBigint: blob({mode: 'bigint'}),
  intNumber: integer(),
  intBoolean: integer({mode: 'boolean'}),
  intTimestamp: integer({mode: 'timestamp'}),
  intTimestampMs: int({mode: 'timestamp_ms'}),
  numString: numeric(),
  numNumber: numeric({mode: 'number'}),
  numBigint: numeric({mode: 'bigint'}),
  real: real(),
  text: text(),
  textLength: text({length: 50}),
  textEnum: text({enum: ['a', 'b']}),
  textJson: text({mode: 'json'}),
};
export type ModePins = [
  Expect<Equal<DataOf<typeof modes.blobBuffer>, Buffer>>,
  Expect<Equal<DataOf<typeof modes.blobJson>, unknown>>,
  Expect<Equal<DataOf<typeof modes.blobBigint>, RTBigInt>>,
  Expect<Equal<DataOf<typeof modes.intNumber>, IntegerFormat>>,
  Expect<Equal<DataOf<typeof modes.intBoolean>, boolean>>,
  Expect<Equal<DataOf<typeof modes.intTimestamp>, RTDate>>,
  Expect<Equal<DataOf<typeof modes.intTimestampMs>, RTDate>>,
  Expect<Equal<DataOf<typeof modes.numString>, string>>,
  Expect<Equal<DataOf<typeof modes.numNumber>, Float>>,
  Expect<Equal<DataOf<typeof modes.numBigint>, bigint>>,
  Expect<Equal<DataOf<typeof modes.real>, Float>>,
  Expect<Equal<DataOf<typeof modes.text>, Str>>,
  Expect<Equal<DataOf<typeof modes.textLength>, Str<{maxLength: 50}>>>,
  Expect<Equal<DataOf<typeof modes.textEnum>, 'a' | 'b'>>,
  Expect<Equal<DataOf<typeof modes.textJson>, unknown>>,
  Expect<Equal<typeof modes.blobBigint, Blob<{mode: 'bigint'}>>>,
  Expect<Equal<typeof modes.numNumber, Numeric<{mode: 'number'}>>>,
  Expect<Equal<typeof modes.intTimestampMs, Int<{mode: 'timestamp_ms'}>>>,
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
  Expect<Equal<(typeof named)['columns']['id'], Integer<{primaryKey: true}>>>,
  Expect<Equal<(typeof named)['columns']['createdAt'], Integer<{mode: 'timestamp'; notNull: true}>>>,
];

// ── every builder ────────────────────────────────────────────────────────────

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

export type EveryPins = [
  Expect<Equal<typeof every, Every>>,
  Expect<Equal<InferSelectModel<Every>, EverySelectBefore>>,
  Expect<Equal<InferInsertModel<Every>, EveryInsertBefore>>,
  Expect<Equal<InferUpdateModel<Every>, EveryUpdateBefore>>,
];

// ── wide vocabulary: sqlite's own modifiers, runtime callbacks and generated columns ──

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

export type WidePins = [
  Expect<Equal<typeof wide, Wide>>,
  Expect<Equal<InferSelectModel<Wide>, WideSelectBefore>>,
  Expect<Equal<InferInsertModel<Wide>, WideInsertBefore>>,
  Expect<Equal<InferUpdateModel<Wide>, WideUpdateBefore>>,
  // A runtime default and an update callback make the column optional on insert; a generated one leaves it out.
  Expect<Equal<undefined extends InferInsertModel<Wide>['slug'] ? true : false, true>>,
  Expect<Equal<undefined extends InferInsertModel<Wide>['touched'] ? true : false, true>>,
  Expect<Equal<'derived' extends keyof InferInsertModel<Wide> ? true : false, false>>,
];

// ── the key flags drizzle reads ──────────────────────────────────────────────

export type KeyFlagPins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer<{primaryKey: true}>>>['primaryKey'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Text>>['primaryKey'], false>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer<{primaryKey: [{autoIncrement: true}]}>>>['primaryKey'], true>>,
  // drizzle's sqlite never sets isAutoincrement, so the autoIncrement primary key leaves the flag false.
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer<{primaryKey: [{autoIncrement: true}]}>>>['autoincrement'], false>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Text<{$defaultFn: true}>>>['runtimeDefault'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Text>>['runtimeDefault'], false>>,
];

// ── the column flags ToDrizzleTable hands drizzle ────────────────────────────

type DzWide = ToDrizzleTable<Wide>;
export type ToDrizzleFlagPins = [
  Expect<Equal<DzWide['role']['_']['notNull'], true>>,
  Expect<Equal<DzWide['payload']['_']['notNull'], false>>,
  Expect<Equal<DzWide['id']['_']['hasDefault'], true>>,
  Expect<Equal<DzWide['slug']['_']['hasDefault'], true>>,
  Expect<Equal<DzWide['flag']['_']['hasDefault'], true>>,
  Expect<Equal<DzWide['email']['_']['hasDefault'], false>>,
  Expect<Equal<DzWide['email']['_']['generated'], undefined>>,
  Expect<Equal<DzWide['derived']['_']['generated'] extends {type: 'always'} ? true : false, true>>,
];

// ── queries through drizzle's database type ──────────────────────────────────

declare const sqliteDb: BaseSQLiteDatabase<'async', unknown>;
export const dzUsers = toDrizzle(users);
export const selected = sqliteDb.select().from(dzUsers);
export const inserted = sqliteDb.insert(dzUsers).values({name: 'a', role: 'admin', createdAt: new Date()}).returning();
export const updated = sqliteDb.update(dzUsers).set({rating: 2}).returning({id: dzUsers.id});
export const rawSelected = sqliteDb.select().from(rawUsers);
export const rawInserted = sqliteDb.insert(rawUsers).values({name: 'a', role: 'admin', createdAt: new Date()}).returning();
export const rawUpdated = sqliteDb.update(rawUsers).set({rating: 2}).returning({id: rawUsers.id});
type InsertValues<Q> = Q extends {values(value: infer V): unknown} ? V : never;
type UpdateSet<Q> = Q extends {set(values: infer V): unknown} ? V : never;
export type QueryPins = [
  Expect<Equal<Awaited<typeof selected>, Awaited<typeof rawSelected>>>,
  Expect<Equal<Awaited<typeof inserted>, Awaited<typeof rawInserted>>>,
  Expect<Equal<Awaited<typeof updated>, Awaited<typeof rawUpdated>>>,
  Expect<Equal<keyof Awaited<typeof selected>[number], 'id' | 'name' | 'rating' | 'role' | 'createdAt'>>,
  Expect<
    Equal<
      InsertValues<ReturnType<typeof sqliteDb.insert<typeof dzUsers>>>,
      InsertValues<ReturnType<typeof sqliteDb.insert<typeof rawUsers>>>
    >
  >,
  Expect<
    Equal<
      UpdateSet<ReturnType<typeof sqliteDb.update<typeof dzUsers>>>,
      UpdateSet<ReturnType<typeof sqliteDb.update<typeof rawUsers>>>
    >
  >,
];

// ── references, across tables and to itself ──────────────────────────────────

export const teams = sqliteTable('teams', {id: integer({primaryKey: true})});
export const members = sqliteTable('members', {
  id: integer({primaryKey: true}),
  teamId: integer('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
});
type Members = SqliteTable<
  'members',
  {id: Integer<{primaryKey: true}>; teamId: Integer<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
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

// ── views ────────────────────────────────────────────────────────────────────

export const activeView = sqliteView('active', {name: text('user_name', {length: 10, notNull: true}), note: text()}).existing();
// drizzle exports the view factory twice, so both names give the same type.
export const aliasView = view('active', {name: text('user_name', {length: 10, notNull: true}), note: text()}).existing();
type ActiveView = SqliteView<'active', {name: Text<{length: 10; notNull: true}>; note: Text}, {name: 'user_name'}>;

export type ViewPins = [
  Expect<Equal<typeof activeView, ActiveView>>,
  Expect<Equal<typeof aliasView, ActiveView>>,
  Expect<Equal<InferSelectViewModel<ActiveView>, ActiveViewViewSelectBefore>>,
];
// @ts-expect-error the query-builder form has no columns to type, so it has no as()
sqliteView('from_query').as(sql`select 1`);

// ── table creators and the columns callback ──────────────────────────────────

export const prefixed = sqliteTableCreator((name) => `app_${name}`);
export const createdUsers = prefixed('users', {
  id: integer({primaryKey: [{autoIncrement: true}]}),
  name: text({length: 100, notNull: true}),
  rating: real({notNull: true, default: [4.5]}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  createdAt: integer({mode: 'timestamp', notNull: true}),
});
export const byCallback = sqliteTable('users', (helpers) => ({
  id: helpers.integer({primaryKey: [{autoIncrement: true}]}),
  name: helpers.text({length: 100, notNull: true}),
  rating: helpers.real({notNull: true, default: [4.5]}),
  role: helpers.text({enum: ['admin', 'user'], notNull: true}),
  createdAt: helpers.integer({mode: 'timestamp', notNull: true}),
}));
export const createdByCallback = prefixed('users', (helpers) => ({
  id: helpers.integer({primaryKey: [{autoIncrement: true}]}),
  name: helpers.text({length: 100, notNull: true}),
  rating: helpers.real({notNull: true, default: [4.5]}),
  role: helpers.text({enum: ['admin', 'user'], notNull: true}),
  createdAt: helpers.integer({mode: 'timestamp', notNull: true}),
}));
export type CreatorPins = [
  Expect<Equal<typeof createdUsers, Users>>,
  Expect<Equal<typeof byCallback, Users>>,
  Expect<Equal<typeof createdByCallback, Users>>,
];

// ── refine keeps every column fact, key flags included ───────────────────────

type RefinedUsers = RefinedTable<Users, {name: {maxLength: 50}}>;
type RefinedWide = RefinedTable<Wide, {email: {maxLength: 50}}>;
export type RefinePins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['primaryKey'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedWide['columns']['slug']>>['runtimeDefault'], true>>,
  Expect<Equal<InferSelectModel<RefinedUsers>, UsersRefinedSelectBefore>>,
  Expect<Equal<InferInsertModel<RefinedUsers>, UsersRefinedInsertBefore>>,
];

// ── toDrizzle names columns as drizzle does, on BOTH roads ────────────────────
// The names map is on the table, so a builder table gets its db names back too.

export type DbNamePins = [
  Expect<Equal<ToDrizzleTable<typeof named>['createdAt']['_']['name'], 'created_at'>>,
  Expect<Equal<ToDrizzleTable<Named>['id']['_']['name'], 'id'>>,
  Expect<Equal<keyof DzInferSelectModel<ToDrizzleTable<Named>, {dbColumnNames: true}>, 'id' | 'created_at'>>,
];

// ── the rowid: an integer primary key is optional on insert, a text one required ──

export const intPk = sqliteTable('int_pk', {id: integer({primaryKey: true}), note: text()});
export const intAliasPk = sqliteTable('int_alias_pk', {id: int({primaryKey: true})});
export const textPk = sqliteTable('text_pk', {id: text({primaryKey: true})});
export const textAutoPk = sqliteTable('text_auto_pk', {id: text({primaryKey: [{autoIncrement: true}]})});
export type OnlySqlite_RowidPins = [
  Expect<Equal<InferInsertModel<typeof intPk>, IntPkInsertBefore>>,
  Expect<Equal<InferInsertModel<typeof intAliasPk>, {id?: IntegerFormat}>>,
  Expect<Equal<InferInsertModel<typeof textPk>, TextPkInsertBefore>>,
  // primaryKey({autoIncrement: true}) gives any column a default, as the chained kind did.
  Expect<Equal<InferInsertModel<typeof textAutoPk>, TextAutoPkInsertBefore>>,
  // Without the primary key the rowid base flag gives no default.
  Expect<Equal<InferInsertModel<SqliteTable<'n', {id: Integer<{notNull: true}>}>>, {id: IntegerFormat}>>,
  Expect<Equal<ToDrizzleTable<typeof intPk>['id']['_']['hasDefault'], true>>,
  Expect<Equal<ToDrizzleTable<typeof textPk>['id']['_']['hasDefault'], false>>,
  Expect<Equal<ToDrizzleTable<typeof textAutoPk>['id']['_']['hasDefault'], true>>,
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
type CfNote = InferSelectModel<typeof cfApi>;
type NewCfNote = InferInsertModel<typeof cfApi>;
type CfNotePatch = InferUpdateModel<typeof cfApi>;
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

// ── wrong modifiers are rejected ─────────────────────────────────────────────

// @ts-expect-error another dialect's modifier is rejected
text({array: true});
// @ts-expect-error a references() target must be a tableRef(), which records its table
integer({references: [() => users]});
// @ts-expect-error a stray key is rejected in a call
integer({notNull: true, defaultNow: true});
// @ts-expect-error a stray key is rejected in a column type
export type BadStrayKey = Text<{length: 10; defaultNow: true}>;
// @ts-expect-error a stray key is rejected in a named call
text('name', {length: 10, generatedAlwaysAsIdentity: true});
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
// @ts-expect-error only mysql, sqlite: unique takes a name only
text({unique: ['uq', {nulls: 'distinct'}]});
// @ts-expect-error real takes no mode
real({mode: 'number'});

// ── refinement rejections ────────────────────────────────────────────────────

// @ts-expect-error "nam" is not a column of the table
export type BadRefineKey = RefinedTable<Users, {nam: {minLength: 2}}>;
// @ts-expect-error a string column takes no numeric refinement
export type BadRefineParam = RefinedTable<Users, {name: {min: 2}}>;
// @ts-expect-error a boolean column carries no refinable format
refineTableType(sqliteTable('flags', {on: integer({mode: 'boolean'})}), {on: {min: 1}});
// @ts-expect-error an enum column carries no refinable format
refineTableType(users, {role: {maxLength: 3}});
// @ts-expect-error refining cannot change the value family
refineTableType(users, {name: {min: 3}});

// ── views: select-only models ────────────────────────────────────────────────

// @ts-expect-error InferSelectModel takes a table, a view uses InferSelectViewModel
export type ViewNotSelectModel = InferSelectModel<typeof activeView>;
// @ts-expect-error a view has no insert model
export type ViewNotInsertModel = InferInsertModel<typeof activeView>;
// @ts-expect-error a view has no update model
export type ViewNotUpdateModel = InferUpdateModel<typeof activeView>;

// ── the slim <-> drizzle boundary ────────────────────────────────────────────
// toDrizzle drops a FORMAT tag (optional sentinels) but keeps a NOMINAL brand, or a queried id could not go back.

export const boundaryUsers = sqliteTable('boundary_users', {
  name: text({length: 100, notNull: true}),
  age: integer({notNull: true}),
  createdAt: integer('created_at', {mode: 'timestamp', notNull: true}),
});
export const boundaryApi = refineTableType(boundaryUsers, {name: {minLength: 10}, age: {min: 18}});
export const boundaryQuery = sqliteDb.select().from(toDrizzle(boundaryApi));
declare const boundaryRows: Awaited<typeof boundaryQuery>;
declare const newBoundary: InferInsertModel<typeof boundaryApi>;
declare const boundaryPatch: InferUpdateModel<typeof boundaryApi>;
export const rowIntoModel: InferSelectModel<typeof boundaryApi> = boundaryRows[0]!;
export const rowsIntoModel: InferSelectModel<typeof boundaryApi>[] = boundaryRows;
export const insertFromModel = sqliteDb.insert(toDrizzle(boundaryApi)).values([newBoundary, newBoundary]);
export const updateFromModel = sqliteDb.update(toDrizzle(boundaryApi)).set(boundaryPatch);

type BoundaryId = Str<{minLength: 1}, 'BoundaryId'>;
export const brandedTable = sqliteTable('boundary_branded', {id: text({length: 40, notNull: true, $type: $type<BoundaryId>()})});
export const brandedQuery = sqliteDb.select().from(toDrizzle(brandedTable));
declare const brandedRows: Awaited<typeof brandedQuery>;
export const brandedRowIntoModel: InferSelectModel<typeof brandedTable> = brandedRows[0]!;

export type BoundaryPins = [
  Expect<Equal<(typeof boundaryRows)[number]['name'], string>>,
  Expect<Equal<(typeof boundaryRows)[number]['createdAt'], Date>>,
  Expect<Equal<InferSelectModel<typeof brandedTable>['id'], BoundaryId>>,
];
