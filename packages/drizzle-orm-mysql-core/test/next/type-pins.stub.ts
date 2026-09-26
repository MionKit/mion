/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the side-by-side mysql columns (checked by tsc, not executed): a builder table
// IS its hand-written twin, and its models equal the shipped system's models for the same table.

import type {
  BigInt64,
  BigUInt64,
  Date as RTDate,
  Float as FloatFormat,
  Int32,
  Integer as IntegerFormat,
  StringDate,
  StringDateTime,
  UInt8,
  UInt16,
  UInt32,
} from '@mionjs/run-types/formats';
import type {
  InferInsertModel,
  InferSelectModel,
  InferSelectViewModel,
  InferUpdateModel,
} from '../../../drizzle-orm/src/models.ts';
import type {RefinedTable as CurRefinedTable} from '../../../drizzle-orm/src/refine.ts';
import type {ColSpecOf, KeyFlagsOf, RefinedTable} from '../../../drizzle-orm/next/index.ts';
import {refineTableType} from '../../../drizzle-orm/next/index.ts';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import type {MySqlDatabase, MySqlQueryResultHKT, PreparedQueryHKTBase} from 'drizzle-orm/mysql-core';
import type {ToDrizzleTable} from '../../next/drizzle.ts';
import {toDrizzle} from '../../next/drizzle.ts';
import {toDrizzle as curToDrizzle} from '../../src/drizzle.ts';
import type * as next from '../../../drizzle-orm/next/models.ts';
import {$type, tableRef, type TableRef} from '../../../drizzle-orm/next/index.ts';
import * as cur from '../../src/index.ts';
import type {
  Bigint,
  Binary,
  Boolean,
  Char,
  CustomCol,
  Datetime,
  Decimal,
  Double,
  Float,
  Int,
  Json,
  Longtext,
  Mediumint,
  Mediumtext,
  MySqlDate,
  MysqlEnumCol,
  MysqlEnumObjectCol,
  MysqlTable,
  MysqlView,
  Real,
  Serial,
  Smallint,
  Text,
  Time,
  Timestamp,
  Tinyint,
  Tinytext,
  Varbinary,
  Varchar,
  Year,
} from '../../next/index.ts';
import {
  bigint,
  binary,
  boolean,
  char,
  customType,
  date,
  datetime,
  decimal,
  double,
  float,
  int,
  json,
  longtext,
  mediumint,
  mediumtext,
  mysqlEnum,
  mysqlSchema,
  mysqlTable,
  mysqlTableCreator,
  mysqlView,
  real,
  serial,
  smallint,
  text,
  time,
  timestamp,
  tinyint,
  tinytext,
  varbinary,
  varchar,
  year,
} from '../../next/index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type DataOf<C> = ColSpecOf<C> extends {data: infer D} ? D : never;

// ── narrow, nameless ─────────────────────────────────────────────────────────

export const users = mysqlTable('users', {
  id: serial({primaryKey: true}),
  name: varchar({length: 100, notNull: true}),
  age: int({notNull: true}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  createdAt: timestamp({mode: 'date', notNull: true, defaultNow: true}),
});
type Users = MysqlTable<
  'users',
  {
    id: Serial<{primaryKey: true}>;
    name: Varchar<{length: 100; notNull: true}>;
    age: Int<{notNull: true}>;
    role: Text<{enum: ['admin', 'user']; notNull: true}>;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
  }
>;
export const curUsers = cur.mysqlTable('users', {
  id: cur.serial().primaryKey(),
  name: cur.varchar({length: 100}).notNull(),
  age: cur.int().notNull(),
  role: cur.text({enum: ['admin', 'user']}).notNull(),
  createdAt: cur.timestamp({mode: 'date'}).notNull().defaultNow(),
});

// With one call per column, a builder column IS the hand-written column, even outside a table.
export const looseVarchar = varchar({length: 100, notNull: true, unique: ['uq_name']});
export const looseInt = int({notNull: true, default: [21]});
export const looseUnsigned = int({unsigned: true, autoincrement: true});
export type LoosePins = [
  Expect<Equal<typeof looseVarchar, Varchar<{length: 100; notNull: true; unique: ['uq_name']}>>>,
  Expect<Equal<typeof looseInt, Int<{notNull: true; default: [21]}>>>,
  Expect<Equal<typeof looseUnsigned, Int<{unsigned: true; autoincrement: true}>>>,
];

export type NarrowPins = [
  Expect<Equal<typeof users, Users>>,
  Expect<Equal<next.InferSelectModel<Users>, InferSelectModel<typeof curUsers>>>,
  Expect<Equal<next.InferInsertModel<Users>, InferInsertModel<typeof curUsers>>>,
  Expect<Equal<next.InferUpdateModel<Users>, InferUpdateModel<typeof curUsers>>>,
];

// ── unsigned and mode move onto the props and pick the data type ─────────────

export const modes = {
  bigNumber: bigint({mode: 'number'}),
  bigBig: bigint({mode: 'bigint'}),
  bigUnsigned: bigint({mode: 'bigint', unsigned: true}),
  intUnsigned: int({unsigned: true}),
  smallUnsigned: smallint({unsigned: true}),
  tinyUnsigned: tinyint({unsigned: true}),
  decimalNumber: decimal({mode: 'number', precision: 10, scale: 2}),
  decimalBigint: decimal({mode: 'bigint'}),
  dateString: date({mode: 'string'}),
  datetimeString: datetime({mode: 'string', fsp: 3}),
  timestampString: timestamp({mode: 'string'}),
  bareInt: int(),
  bareTimestamp: timestamp(),
};
export type ModePins = [
  Expect<Equal<DataOf<typeof modes.bigNumber>, IntegerFormat>>,
  Expect<Equal<DataOf<typeof modes.bigBig>, BigInt64>>,
  Expect<Equal<DataOf<typeof modes.bigUnsigned>, BigUInt64>>,
  Expect<Equal<DataOf<typeof modes.intUnsigned>, UInt32>>,
  Expect<Equal<DataOf<typeof modes.smallUnsigned>, UInt16>>,
  Expect<Equal<DataOf<typeof modes.tinyUnsigned>, UInt8>>,
  Expect<Equal<DataOf<typeof modes.decimalNumber>, FloatFormat>>,
  Expect<Equal<DataOf<typeof modes.decimalBigint>, bigint>>,
  Expect<Equal<DataOf<typeof modes.dateString>, StringDate>>,
  Expect<Equal<DataOf<typeof modes.datetimeString>, StringDateTime>>,
  Expect<Equal<DataOf<typeof modes.timestampString>, StringDateTime>>,
  Expect<Equal<DataOf<typeof modes.bareInt>, Int32>>,
  Expect<Equal<DataOf<typeof modes.bareTimestamp>, RTDate>>,
  Expect<Equal<typeof modes.bigUnsigned, Bigint<{mode: 'bigint'; unsigned: true}>>>,
  Expect<Equal<typeof modes.decimalNumber, Decimal<{mode: 'number'; precision: 10; scale: 2}>>>,
  Expect<Equal<typeof modes.datetimeString, Datetime<{mode: 'string'; fsp: 3}>>>,
];

// ── explicit db names go to the table's names map ────────────────────────────

export const named = mysqlTable('named', {
  id: int('id', {primaryKey: true}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true}),
});
type Named = MysqlTable<
  'named',
  {id: Int<{primaryKey: true}>; createdAt: Timestamp<{mode: 'date'; notNull: true}>},
  [],
  {createdAt: 'created_at'}
>;

// The same column shape in two tables is ONE type.
export type NamedPins = [
  Expect<Equal<typeof named, Named>>,
  Expect<Equal<(typeof named)['columns']['id'], Int<{primaryKey: true}>>>,
  Expect<Equal<(typeof named)['columns']['createdAt'], Timestamp<{mode: 'date'; notNull: true}>>>,
];

// ── wide vocabulary: every builder, and mysql's own modifiers ────────────────

const point = customType<{data: {x: number; y: number}}>({dataType: () => 'point'});
export const every = mysqlTable('every', {
  bigint: bigint({mode: 'number'}),
  binary: binary({length: 4}),
  boolean: boolean(),
  char: char({length: 3}),
  date: date(),
  datetime: datetime({fsp: 3}),
  decimal: decimal({precision: 10, scale: 2}),
  double: double(),
  float: float({autoincrement: true}),
  int: int(),
  json: json(),
  longtext: longtext(),
  mediumint: mediumint({unsigned: true}),
  mediumtext: mediumtext(),
  real: real(),
  serial: serial(),
  smallint: smallint(),
  text: text(),
  time: time({fsp: 2}),
  timestamp: timestamp(),
  tinyint: tinyint(),
  tinytext: tinytext(),
  varbinary: varbinary({length: 16}),
  varchar: varchar({length: 10}),
  year: year(),
  enum: mysqlEnum(['a', 'b']),
  point: point(),
});
type Every = MysqlTable<
  'every',
  {
    bigint: Bigint<{mode: 'number'}>;
    binary: Binary<{length: 4}>;
    boolean: Boolean;
    char: Char<{length: 3}>;
    date: MySqlDate;
    datetime: Datetime<{fsp: 3}>;
    decimal: Decimal<{precision: 10; scale: 2}>;
    double: Double;
    float: Float<{autoincrement: true}>;
    int: Int;
    json: Json;
    longtext: Longtext;
    mediumint: Mediumint<{unsigned: true}>;
    mediumtext: Mediumtext;
    real: Real;
    serial: Serial;
    smallint: Smallint;
    text: Text;
    time: Time<{fsp: 2}>;
    timestamp: Timestamp;
    tinyint: Tinyint;
    tinytext: Tinytext;
    varbinary: Varbinary<{length: 16}>;
    varchar: Varchar<{length: 10}>;
    year: Year;
    enum: MysqlEnumCol<['a', 'b']>;
    point: CustomCol<{x: number; y: number}>;
  }
>;
export const curEvery = cur.mysqlTable('every', {
  bigint: cur.bigint({mode: 'number'}),
  binary: cur.binary({length: 4}),
  boolean: cur.boolean(),
  char: cur.char({length: 3}),
  date: cur.date(),
  datetime: cur.datetime({fsp: 3}),
  decimal: cur.decimal({precision: 10, scale: 2}),
  double: cur.double(),
  float: cur.float().autoincrement(),
  int: cur.int(),
  json: cur.json(),
  longtext: cur.longtext(),
  mediumint: cur.mediumint({unsigned: true}),
  mediumtext: cur.mediumtext(),
  real: cur.real(),
  serial: cur.serial(),
  smallint: cur.smallint(),
  text: cur.text(),
  time: cur.time({fsp: 2}),
  timestamp: cur.timestamp(),
  tinyint: cur.tinyint(),
  tinytext: cur.tinytext(),
  varbinary: cur.varbinary({length: 16}),
  varchar: cur.varchar({length: 10}),
  year: cur.year(),
  enum: cur.mysqlEnum(['a', 'b']),
  point: cur.customType<{data: {x: number; y: number}}>({dataType: () => 'point'})(),
});

export type EveryPins = [
  Expect<Equal<typeof every, Every>>,
  Expect<Equal<next.InferSelectModel<Every>, InferSelectModel<typeof curEvery>>>,
  Expect<Equal<next.InferInsertModel<Every>, InferInsertModel<typeof curEvery>>>,
  Expect<Equal<next.InferUpdateModel<Every>, InferUpdateModel<typeof curEvery>>>,
];

export const wide = mysqlTable('w', {
  id: serial('id', {primaryKey: true}),
  role: text('role', {enum: ['admin', 'user'], notNull: true}),
  seq: int('seq', {unsigned: true, autoincrement: true}),
  payload: json('payload', {$type: $type<{kind: string}>()}),
  email: varchar('email', {length: 50, unique: ['uq_email']}),
  slug: varchar('slug', {length: 20, $defaultFn: [() => 'x']}),
  total: int('total', {generatedAlwaysAs: [1, {mode: 'stored'}]}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),
  touchedAt: timestamp('touched_at', {onUpdateNow: true}),
});
type Wide = MysqlTable<
  'w',
  {
    id: Serial<{primaryKey: true}>;
    role: Text<{enum: ['admin', 'user']; notNull: true}>;
    seq: Int<{unsigned: true; autoincrement: true}>;
    payload: Json<{$type: [{kind: string}]}>;
    email: Varchar<{length: 50; unique: ['uq_email']}>;
    slug: Varchar<{length: 20; $defaultFn: true}>;
    total: Int<{generatedAlwaysAs: [1, {mode: 'stored'}]}>;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
    touchedAt: Timestamp<{onUpdateNow: true}>;
  },
  [],
  {createdAt: 'created_at'; touchedAt: 'touched_at'}
>;
export const curWide = cur.mysqlTable('w', {
  id: cur.serial('id').primaryKey(),
  role: cur.text('role', {enum: ['admin', 'user']}).notNull(),
  seq: cur.int('seq', {unsigned: true}).autoincrement(),
  payload: cur.json('payload').$type<{kind: string}>(),
  email: cur.varchar('email', {length: 50}).unique('uq_email'),
  slug: cur.varchar('slug', {length: 20}).$defaultFn(() => 'x'),
  total: cur.int('total').generatedAlwaysAs(1, {mode: 'stored'}),
  createdAt: cur.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
  touchedAt: cur.timestamp('touched_at').onUpdateNow(),
});

export type WidePins = [
  Expect<Equal<typeof wide, Wide>>,
  Expect<Equal<next.InferSelectModel<Wide>, InferSelectModel<typeof curWide>>>,
  Expect<Equal<next.InferInsertModel<Wide>, InferInsertModel<typeof curWide>>>,
  Expect<Equal<next.InferUpdateModel<Wide>, InferUpdateModel<typeof curWide>>>,
  // autoincrement and onUpdateNow both give the column a database default.
  Expect<Equal<next.InferInsertModel<Wide>['seq'], UInt32 | null | undefined>>,
  Expect<Equal<next.InferInsertModel<Wide>['touchedAt'], RTDate | null | undefined>>,
  Expect<Equal<'total' extends keyof next.InferInsertModel<Wide> ? true : false, false>>,
];

// ── the key flags $returningId() reads ───────────────────────────────────────

export type KeyFlagPins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<Serial>>['autoincrement'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Int<{autoincrement: true}>>>['autoincrement'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Int>>['autoincrement'], false>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Varchar<{length: 8; $defaultFn: true}>>>['runtimeDefault'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Varchar<{length: 8; primaryKey: true}>>>['primaryKey'], true>>,
];

// $returningId() returns exactly the primary keys that autoincrement or carry a runtime default.
export const keyed = mysqlTable('keyed', {
  id: serial({primaryKey: true}),
  code: varchar({length: 8, primaryKey: true, $defaultFn: [() => 'x']}),
  seq: int({autoincrement: true}),
  name: varchar({length: 50, notNull: true}),
});
export const intKeyed = mysqlTable('int_keyed', {id: int({primaryKey: true, autoincrement: true}), name: text()});
export const plainKeyed = mysqlTable('plain_keyed', {id: int({primaryKey: true}), name: text()});
export const curKeyed = cur.mysqlTable('keyed', {
  id: cur.serial().primaryKey(),
  code: cur
    .varchar({length: 8})
    .primaryKey()
    .$defaultFn(() => 'x'),
  seq: cur.int().autoincrement(),
  name: cur.varchar({length: 50}).notNull(),
});
declare const myDb: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase>;
export const keyedIds = myDb.insert(toDrizzle(keyed)).values({code: 'a', name: 'a'}).$returningId();
export const curKeyedIds = myDb.insert(curToDrizzle(curKeyed)).values({code: 'a', name: 'a'}).$returningId();
export const intKeyedIds = myDb.insert(toDrizzle(intKeyed)).values({}).$returningId();
export const plainKeyedIds = myDb.insert(toDrizzle(plainKeyed)).values({id: 1}).$returningId();
// A refined serial primary key keeps its key flags, so `$returningId()` still returns it.
export const refinedKeyedIds = myDb
  .insert(toDrizzle(refineTableType(keyed, {id: {max: 1000}})))
  .values({name: 'a'})
  .$returningId();
export type ReturningIdPins = [
  Expect<Equal<Awaited<typeof keyedIds>, {id: number; code: string}[]>>,
  Expect<Equal<Awaited<typeof keyedIds>, Awaited<typeof curKeyedIds>>>,
  Expect<Equal<Awaited<typeof intKeyedIds>, {id: number}[]>>,
  Expect<Equal<keyof Awaited<typeof plainKeyedIds>[number], never>>,
  Expect<Equal<Awaited<typeof refinedKeyedIds>, {id: number; code: string}[]>>,
];

// ── references, across tables and to itself ──────────────────────────────────

export const teams = mysqlTable('teams', {id: serial({primaryKey: true})});
export const members = mysqlTable('members', {
  id: serial({primaryKey: true}),
  teamId: int('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
});
type Members = MysqlTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Int<{references: [{table: 'teams'; column: 'id'}, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
export const emps = mysqlTable('emps', {
  id: serial({primaryKey: true}),
  managerId: int({references: [(): TableRef<'emps', 'id'> => tableRef(emps, 'id')]}),
});
type Emps = MysqlTable<'emps', {id: Serial<{primaryKey: true}>; managerId: Int<{references: [{table: 'emps'; column: 'id'}]}>}>;

type MembersByRef = MysqlTable<
  'members',
  {id: Serial<{primaryKey: true}>; teamId: Int<{references: [TableRef<typeof teams, 'id'>, {onDelete: 'cascade'}]}>},
  [],
  {teamId: 'team_id'}
>;
type EmpsByRef = MysqlTable<'emps', {id: Serial<{primaryKey: true}>; managerId: Int<{references: [TableRef<'emps', 'id'>]}>}>;

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

// ── views, enums, schemas and table creators ─────────────────────────────────

export const activeView = mysqlView('active', {name: varchar('user_name', {length: 10, notNull: true})})
  .algorithm('merge')
  .sqlSecurity('invoker')
  .withCheckOption('cascaded')
  .existing();
type ActiveView = MysqlView<'active', {name: Varchar<{length: 10; notNull: true}>}, {name: 'user_name'}>;
export const curActiveView = cur.mysqlView('active', {name: cur.varchar('user_name', {length: 10}).notNull()}).existing();
export const withEnum = mysqlTable('with_enum', {
  mood: mysqlEnum('mood', ['sad', 'happy'], {notNull: true}),
  level: mysqlEnum({Low: 'low', High: 'high'} as const, {default: ['low']}),
});
type WithEnum = MysqlTable<
  'with_enum',
  {
    mood: MysqlEnumCol<['sad', 'happy'], {notNull: true}>;
    level: MysqlEnumObjectCol<{Low: 'low'; High: 'high'}, {default: ['low']}>;
  }
>;
export const shop = mysqlSchema('shop');
export const shopItems = shop.table('items', {id: serial({primaryKey: true}), label: varchar('item_label', {length: 20})});
export const shopView = shop.view('item_view', {label: varchar({length: 20})}).existing();
export const prefixed = mysqlTableCreator((name) => `app_${name}`);
export const prefixedItems = prefixed('items', (helpers) => ({id: helpers.serial({primaryKey: true}), note: helpers.text()}));
type Items = MysqlTable<'items', {id: Serial<{primaryKey: true}>; label: Varchar<{length: 20}>}, [], {label: 'item_label'}>;

export type ViewEnumSchemaPins = [
  Expect<Equal<typeof activeView, ActiveView>>,
  Expect<Equal<next.InferSelectViewModel<ActiveView>, InferSelectViewModel<typeof curActiveView>>>,
  Expect<Equal<typeof withEnum, WithEnum>>,
  Expect<Equal<next.InferSelectModel<WithEnum>, {mood: 'sad' | 'happy'; level: 'low' | 'high' | null}>>,
  Expect<Equal<MysqlEnumObjectCol<{Low: 'low'; High: 'high'}>, MysqlEnumCol<['low', 'high']>>>,
  Expect<Equal<typeof shopItems, Items>>,
  Expect<Equal<typeof shopView, MysqlView<'item_view', {label: Varchar<{length: 20}>}>>>,
  Expect<Equal<typeof prefixedItems, MysqlTable<'items', {id: Serial<{primaryKey: true}>; note: Text}>>>,
];

// ── refine keeps every column fact, key flags included ───────────────────────

type RefinedUsers = RefinedTable<Users, {name: {maxLength: 50}}>;
export type RefinePins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['primaryKey'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['autoincrement'], true>>,
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

// @ts-expect-error varchar has no autoincrement
export type BadAutoincrement = Varchar<{autoincrement: true}>;
// @ts-expect-error autoincrement is the numeric kinds only
char({autoincrement: true});
// @ts-expect-error onUpdateNow is timestamp only
export type BadOnUpdateNow = Datetime<{onUpdateNow: true}>;
// @ts-expect-error onUpdateNow is timestamp only
int({onUpdateNow: true});
// @ts-expect-error defaultNow is timestamp only
text({defaultNow: true});
// @ts-expect-error mysql columns have no array
text({array: true});
// @ts-expect-error varchar needs its length
varchar();
// @ts-expect-error a references() target must be a tableRef(), which records its table
int({references: [() => users]});
// @ts-expect-error a stray key is rejected beside valid ones too
int({unsigned: true, onUpdateNow: true});
// @ts-expect-error a stray key is rejected beside valid ones too
export type BadStrayKey = Varchar<{length: 10; autoincrement: true}>;
// @ts-expect-error a stray key is rejected in a named call too
varchar('name', {length: 10, autoincrement: true});
