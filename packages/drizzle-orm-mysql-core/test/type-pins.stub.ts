/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the mysql columns (checked by tsc, not executed): a builder table IS its hand-written twin,
// its models equal the models the chained system produced for the same table, and its queries type as raw drizzle's.

import type {
  BigInt64,
  BigUInt64,
  Date as RTDate,
  Float as FloatFormat,
  Int8,
  Int16,
  Int32,
  Integer as IntegerFormat,
  MergeFormat,
  Number as NumberFormat,
  PositiveInt,
  String,
  StringDate,
  StringDateTime,
  StringTime,
  UInt8,
  UInt16,
  UInt32,
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
import * as dz from 'drizzle-orm/mysql-core';
import type {MySqlDatabase, MySqlQueryResultHKT, PreparedQueryHKTBase} from 'drizzle-orm/mysql-core';
import type {ToDrizzleTable} from '../src/drizzle.ts';
import {toDrizzle} from '../src/drizzle.ts';
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
  MySqlViewAlgorithm,
  MySqlViewCheckOption,
  MySqlViewSecurity,
  MysqlEnumCol,
  MysqlEnumObjectCol,
  MysqlTable,
  MysqlView,
  MysqlViewBuilder,
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
  ViewFromQueryBuilderNotSupported,
  Year,
  YearData,
} from '../src/index.ts';
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
} from '../src/index.ts';

// ── the models the chained system produced, captured before the switch ────────

type ActiveViewViewSelectBefore = {name: String<{maxLength: 10}>; note: String | null};
type EveryInsertBefore = {
  bigint?: IntegerFormat | null | undefined;
  binary?: string | null | undefined;
  boolean?: boolean | null | undefined;
  char?: String<{length: 3}> | null | undefined;
  date?: RTDate | null | undefined;
  datetime?: RTDate | null | undefined;
  decimal?: string | null | undefined;
  double?: FloatFormat | null | undefined;
  float?: FloatFormat | null | undefined;
  int?: Int32 | null | undefined;
  json?: unknown;
  longtext?: String | null | undefined;
  mediumint?: NumberFormat<{integer: true; min: 0; max: 16777215}> | null | undefined;
  mediumtext?: String | null | undefined;
  real?: FloatFormat | null | undefined;
  serial?: PositiveInt | undefined;
  smallint?: Int16 | null | undefined;
  text?: String | null | undefined;
  time?: StringTime | null | undefined;
  timestamp?: RTDate | null | undefined;
  tinyint?: Int8 | null | undefined;
  tinytext?: String | null | undefined;
  varbinary?: string | null | undefined;
  varchar?: String<{maxLength: 10}> | null | undefined;
  year?: YearData | null | undefined;
  enum?: 'a' | 'b' | null | undefined;
  point?: {x: number; y: number} | null | undefined;
};
type EverySelectBefore = {
  bigint: IntegerFormat | null;
  binary: string | null;
  boolean: boolean | null;
  char: String<{length: 3}> | null;
  date: RTDate | null;
  datetime: RTDate | null;
  decimal: string | null;
  double: FloatFormat | null;
  float: FloatFormat | null;
  int: Int32 | null;
  json: unknown;
  longtext: String | null;
  mediumint: NumberFormat<{integer: true; min: 0; max: 16777215}> | null;
  mediumtext: String | null;
  real: FloatFormat | null;
  serial: PositiveInt;
  smallint: Int16 | null;
  text: String | null;
  time: StringTime | null;
  timestamp: RTDate | null;
  tinyint: Int8 | null;
  tinytext: String | null;
  varbinary: string | null;
  varchar: String<{maxLength: 10}> | null;
  year: YearData | null;
  enum: 'a' | 'b' | null;
  point: {x: number; y: number} | null;
};
type OptionViewViewSelectBefore = {name: String<{maxLength: 10}>};
type UsersInsertBefore = {
  name: String<{maxLength: 100}>;
  age: Int32;
  role: 'admin' | 'user';
  id?: PositiveInt | undefined;
  createdAt?: RTDate | undefined;
};
type UsersRefinedInsertBefore = {
  name: MergeFormat<String<{maxLength: 100}>, {maxLength: 50}>;
  age: Int32;
  role: 'admin' | 'user';
  id?: PositiveInt | undefined;
  createdAt?: RTDate | undefined;
};
type UsersRefinedSelectBefore = {
  id: PositiveInt;
  name: MergeFormat<String<{maxLength: 100}>, {maxLength: 50}>;
  age: Int32;
  role: 'admin' | 'user';
  createdAt: RTDate;
};
type UsersSelectBefore = {id: PositiveInt; name: String<{maxLength: 100}>; age: Int32; role: 'admin' | 'user'; createdAt: RTDate};
type UsersUpdateBefore = {
  id?: PositiveInt | undefined;
  name?: String<{maxLength: 100}> | undefined;
  age?: Int32 | undefined;
  role?: 'admin' | 'user' | undefined;
  createdAt?: RTDate | undefined;
};
type WideInsertBefore = {
  role: 'admin' | 'user';
  id?: PositiveInt | undefined;
  seq?: UInt32 | null | undefined;
  payload?: {kind: string} | null | undefined;
  email?: String<{maxLength: 50}> | null | undefined;
  slug?: String<{maxLength: 20}> | null | undefined;
  stamp?: String<{maxLength: 20}> | null | undefined;
  createdAt?: RTDate | undefined;
  touchedAt?: RTDate | null | undefined;
};
type WideSelectBefore = {
  id: PositiveInt;
  role: 'admin' | 'user';
  seq: UInt32 | null;
  payload: {kind: string} | null;
  email: String<{maxLength: 50}> | null;
  slug: String<{maxLength: 20}> | null;
  stamp: String<{maxLength: 20}> | null;
  total: Int32 | null;
  createdAt: RTDate;
  touchedAt: RTDate | null;
};
type WideUpdateBefore = {
  id?: PositiveInt | undefined;
  role?: 'admin' | 'user' | undefined;
  seq?: UInt32 | null | undefined;
  payload?: {kind: string} | null | undefined;
  email?: String<{maxLength: 50}> | null | undefined;
  slug?: String<{maxLength: 20}> | null | undefined;
  stamp?: String<{maxLength: 20}> | null | undefined;
  createdAt?: RTDate | undefined;
  touchedAt?: RTDate | null | undefined;
};
type WithEnumInsertBefore = {
  mood: 'sad' | 'happy';
  level?: 'low' | 'high' | null | undefined;
  bare?: 'x' | 'y' | null | undefined;
};
type WithEnumSelectBefore = {mood: 'sad' | 'happy'; level: 'low' | 'high' | null; bare: 'x' | 'y' | null};

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type DataOf<C> = ColSpecOf<C> extends {data: infer D} ? D : never;
type IsOptional<T, K extends keyof T> = Partial<Pick<T, K>> extends Pick<T, K> ? true : false;

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
export const rawUsers = dz.mysqlTable('users', {
  id: dz.serial().primaryKey(),
  name: dz.varchar({length: 100}).notNull(),
  age: dz.int().notNull(),
  role: dz.text({enum: ['admin', 'user']}).notNull(),
  createdAt: dz.timestamp({mode: 'date'}).notNull().defaultNow(),
});

// With one call per column, a builder column IS the hand-written column, even outside a table.
const point = customType<{data: {x: number; y: number}}>({dataType: () => 'point'});
export const looseBigint = bigint({mode: 'bigint', unsigned: true});
export const looseBinary = binary({length: 4});
export const looseBoolean = boolean({notNull: true});
export const looseChar = char({length: 3, enum: ['abc', 'def']});
export const looseDate = date({mode: 'string'});
export const looseDatetime = datetime({fsp: 3});
export const looseDecimal = decimal({precision: 10, scale: 2});
export const looseDouble = double({unsigned: true});
export const looseFloat = float({autoincrement: true});
export const looseInt = int({notNull: true, default: [21]});
export const looseUnsigned = int({unsigned: true, autoincrement: true});
export const looseJson = json({$type: $type<{x: number}>()});
export const looseLongtext = longtext();
export const looseMediumint = mediumint({unsigned: true});
export const looseMediumtext = mediumtext();
export const looseReal = real();
export const looseSerial = serial();
export const looseSmallint = smallint();
export const looseText = text({enum: ['a', 'b']});
export const looseTime = time({fsp: 2});
export const looseTimestamp = timestamp({defaultNow: true, onUpdateNow: true});
export const looseTinyint = tinyint();
export const looseTinytext = tinytext();
export const looseVarbinary = varbinary({length: 16});
export const looseVarchar = varchar({length: 100, notNull: true, unique: ['uq_name']});
export const looseYear = year();
export const looseEnum = mysqlEnum(['a', 'b']);
export const loosePoint = point({notNull: true});
export type LoosePins = [
  Expect<Equal<typeof looseBigint, Bigint<{mode: 'bigint'; unsigned: true}>>>,
  Expect<Equal<typeof looseBinary, Binary<{length: 4}>>>,
  Expect<Equal<typeof looseBoolean, Boolean<{notNull: true}>>>,
  Expect<Equal<typeof looseChar, Char<{length: 3; enum: ['abc', 'def']}>>>,
  Expect<Equal<typeof looseDate, MySqlDate<{mode: 'string'}>>>,
  Expect<Equal<typeof looseDatetime, Datetime<{fsp: 3}>>>,
  Expect<Equal<typeof looseDecimal, Decimal<{precision: 10; scale: 2}>>>,
  Expect<Equal<typeof looseDouble, Double<{unsigned: true}>>>,
  Expect<Equal<typeof looseFloat, Float<{autoincrement: true}>>>,
  Expect<Equal<typeof looseInt, Int<{notNull: true; default: [21]}>>>,
  Expect<Equal<typeof looseUnsigned, Int<{unsigned: true; autoincrement: true}>>>,
  Expect<Equal<typeof looseJson, Json<{$type: [{x: number}]}>>>,
  Expect<Equal<typeof looseLongtext, Longtext>>,
  Expect<Equal<typeof looseMediumint, Mediumint<{unsigned: true}>>>,
  Expect<Equal<typeof looseMediumtext, Mediumtext>>,
  Expect<Equal<typeof looseReal, Real>>,
  Expect<Equal<typeof looseSerial, Serial>>,
  Expect<Equal<typeof looseSmallint, Smallint>>,
  Expect<Equal<typeof looseText, Text<{enum: ['a', 'b']}>>>,
  Expect<Equal<typeof looseTime, Time<{fsp: 2}>>>,
  Expect<Equal<typeof looseTimestamp, Timestamp<{defaultNow: true; onUpdateNow: true}>>>,
  Expect<Equal<typeof looseTinyint, Tinyint>>,
  Expect<Equal<typeof looseTinytext, Tinytext>>,
  Expect<Equal<typeof looseVarbinary, Varbinary<{length: 16}>>>,
  Expect<Equal<typeof looseVarchar, Varchar<{length: 100; notNull: true; unique: ['uq_name']}>>>,
  Expect<Equal<typeof looseYear, Year>>,
  Expect<Equal<typeof looseEnum, MysqlEnumCol<['a', 'b']>>>,
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

// ── every builder ────────────────────────────────────────────────────────────

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

export type EveryPins = [
  Expect<Equal<typeof every, Every>>,
  Expect<Equal<InferSelectModel<Every>, EverySelectBefore>>,
  Expect<Equal<InferInsertModel<Every>, EveryInsertBefore>>,
  // Every column is optional on insert, so the update model is the insert one.
  Expect<Equal<InferUpdateModel<Every>, EveryInsertBefore>>,
];

// ── wide vocabulary: mysql's own modifiers, runtime callbacks and generated columns ──

export const wide = mysqlTable('w', {
  id: serial('id', {primaryKey: true}),
  role: text('role', {enum: ['admin', 'user'], notNull: true}),
  seq: int('seq', {unsigned: true, autoincrement: true}),
  payload: json('payload', {$type: $type<{kind: string}>()}),
  email: varchar('email', {length: 50, unique: ['uq_email']}),
  slug: varchar('slug', {length: 20, $defaultFn: [() => 'x']}),
  stamp: varchar('stamp', {length: 20, $onUpdate: [() => 'y']}),
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
    stamp: Varchar<{length: 20; $onUpdate: true}>;
    total: Int<{generatedAlwaysAs: [1, {mode: 'stored'}]}>;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
    touchedAt: Timestamp<{onUpdateNow: true}>;
  },
  [],
  {createdAt: 'created_at'; touchedAt: 'touched_at'}
>;

export type WidePins = [
  Expect<Equal<typeof wide, Wide>>,
  Expect<Equal<InferSelectModel<Wide>, WideSelectBefore>>,
  Expect<Equal<InferInsertModel<Wide>, WideInsertBefore>>,
  Expect<Equal<InferUpdateModel<Wide>, WideUpdateBefore>>,
  // autoincrement and onUpdateNow both give the column a database default.
  Expect<Equal<InferInsertModel<Wide>['seq'], UInt32 | null | undefined>>,
  Expect<Equal<InferInsertModel<Wide>['touchedAt'], RTDate | null | undefined>>,
  // A runtime default and an update callback make the column optional on insert; a generated one leaves it out.
  Expect<Equal<IsOptional<InferInsertModel<Wide>, 'slug'>, true>>,
  Expect<Equal<IsOptional<InferInsertModel<Wide>, 'stamp'>, true>>,
  Expect<Equal<IsOptional<InferInsertModel<Wide>, 'role'>, false>>,
  Expect<Equal<'total' extends keyof InferInsertModel<Wide> ? true : false, false>>,
];

// ── the key flags drizzle reads ──────────────────────────────────────────────

export type KeyFlagPins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<Serial>>['autoincrement'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Int<{autoincrement: true}>>>['autoincrement'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Int>>['autoincrement'], false>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Varchar<{length: 8; $defaultFn: true}>>>['runtimeDefault'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Varchar<{length: 8; primaryKey: true}>>>['primaryKey'], true>>,
];

// ── the column flags ToDrizzleTable hands drizzle ────────────────────────────

type DzWide = ToDrizzleTable<Wide>;
export type ToDrizzleFlagPins = [
  Expect<Equal<DzWide['role']['_']['notNull'], true>>,
  Expect<Equal<DzWide['email']['_']['notNull'], false>>,
  Expect<Equal<DzWide['createdAt']['_']['hasDefault'], true>>,
  Expect<Equal<DzWide['email']['_']['hasDefault'], false>>,
  Expect<Equal<DzWide['id']['_']['isPrimaryKey'], true>>,
  Expect<Equal<DzWide['email']['_']['isPrimaryKey'], false>>,
  Expect<Equal<DzWide['id']['_']['isAutoincrement'], true>>,
  Expect<Equal<DzWide['seq']['_']['isAutoincrement'], true>>,
  Expect<Equal<DzWide['email']['_']['isAutoincrement'], false>>,
  Expect<Equal<DzWide['slug']['_']['hasRuntimeDefault'], true>>,
  Expect<Equal<DzWide['email']['_']['hasRuntimeDefault'], false>>,
];

// ── queries through drizzle's database type ──────────────────────────────────

declare const myDb: MySqlDatabase<MySqlQueryResultHKT, PreparedQueryHKTBase>;
export const dzUsers = toDrizzle(users);
export const selected = myDb.select().from(dzUsers);
export const inserted = myDb.insert(dzUsers).values({name: 'a', age: 1, role: 'admin'});
export const updated = myDb.update(dzUsers).set({age: 2});
export const rawSelected = myDb.select().from(rawUsers);
export const rawInserted = myDb.insert(rawUsers).values({name: 'a', age: 1, role: 'admin'});
export const rawUpdated = myDb.update(rawUsers).set({age: 2});
type InsertValues<Q> = Q extends {values(value: infer V): unknown} ? V : never;
type UpdateSet<Q> = Q extends {set(values: infer V): unknown} ? V : never;
export type QueryPins = [
  // a queried row IS the slim model, formats included
  Expect<Equal<Awaited<typeof selected>[number], InferSelectModel<typeof users>>>,
  Expect<Equal<Awaited<typeof inserted>, Awaited<typeof rawInserted>>>,
  Expect<Equal<Awaited<typeof updated>, Awaited<typeof rawUpdated>>>,
  Expect<Equal<keyof Awaited<typeof selected>[number], 'id' | 'name' | 'age' | 'role' | 'createdAt'>>,
];
// a format tag is optional, so drizzle's plain values still go in
export const plainInsertIn: InsertValues<ReturnType<typeof myDb.insert<typeof dzUsers>>> = {} as InsertValues<
  ReturnType<typeof myDb.insert<typeof rawUsers>>
>;
export const plainSetIn: UpdateSet<ReturnType<typeof myDb.update<typeof dzUsers>>> = {} as UpdateSet<
  ReturnType<typeof myDb.update<typeof rawUsers>>
>;
// and a queried row still reads as drizzle's own
export const rowAsRaw: Awaited<typeof rawSelected>[number] = {} as Awaited<typeof selected>[number];

// $returningId() returns exactly the primary keys that autoincrement or carry a runtime default.
export const keyed = mysqlTable('keyed', {
  id: serial({primaryKey: true}),
  code: varchar({length: 8, primaryKey: true, $defaultFn: [() => 'x']}),
  seq: int({autoincrement: true}),
  name: varchar({length: 50, notNull: true}),
});
export const intKeyed = mysqlTable('int_keyed', {id: int({primaryKey: true, autoincrement: true}), name: text()});
export const plainKeyed = mysqlTable('plain_keyed', {id: int({primaryKey: true}), name: text()});
export const rawKeyed = dz.mysqlTable('keyed', {
  id: dz.serial().primaryKey(),
  code: dz
    .varchar({length: 8})
    .primaryKey()
    .$defaultFn(() => 'x'),
  seq: dz.int().autoincrement(),
  name: dz.varchar({length: 50}).notNull(),
});
export const keyedIds = myDb.insert(toDrizzle(keyed)).values({code: 'a', name: 'a'}).$returningId();
export const rawKeyedIds = myDb.insert(rawKeyed).values({code: 'a', name: 'a'}).$returningId();
export const intKeyedIds = myDb.insert(toDrizzle(intKeyed)).values({}).$returningId();
export const plainKeyedIds = myDb.insert(toDrizzle(plainKeyed)).values({id: 1}).$returningId();
// A refined serial primary key keeps its key flags, so `$returningId()` still returns it.
export const refinedKeyedIds = myDb
  .insert(toDrizzle(refineTableType(keyed, {id: {max: 1000}})))
  .values({name: 'a'})
  .$returningId();
export type OnlyMysql_ReturningIdPins = [
  Expect<Equal<Awaited<typeof keyedIds>, Pick<InferSelectModel<typeof keyed>, 'id' | 'code'>[]>>,
  Expect<Equal<keyof Awaited<typeof keyedIds>[number], keyof Awaited<typeof rawKeyedIds>[number]>>,
  Expect<Equal<Awaited<typeof intKeyedIds>, Pick<InferSelectModel<typeof intKeyed>, 'id'>[]>>,
  Expect<Equal<keyof Awaited<typeof plainKeyedIds>[number], never>>,
  Expect<Equal<keyof Awaited<typeof refinedKeyedIds>[number], 'id' | 'code'>>,
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

// ── views ────────────────────────────────────────────────────────────────────

export const activeView = mysqlView('active', {name: varchar('user_name', {length: 10, notNull: true}), note: text()}).existing();
type ActiveView = MysqlView<'active', {name: Varchar<{length: 10; notNull: true}>; note: Text}, {name: 'user_name'}>;

export type ViewPins = [
  Expect<Equal<typeof activeView, ActiveView>>,
  Expect<Equal<InferSelectViewModel<ActiveView>, ActiveViewViewSelectBefore>>,
  Expect<Equal<ReturnType<typeof mysqlView>, ViewFromQueryBuilderNotSupported>>,
];
// @ts-expect-error the query-builder form has no columns to type, so it has no as()
mysqlView('from_query').as(sql`select 1`);

// ── table creators and the columns callback ──────────────────────────────────

export const prefixed = mysqlTableCreator((name) => `app_${name}`);
export const createdUsers = prefixed('users', {
  id: serial({primaryKey: true}),
  name: varchar({length: 100, notNull: true}),
  age: int({notNull: true}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  createdAt: timestamp({mode: 'date', notNull: true, defaultNow: true}),
});
export const byCallback = mysqlTable('users', (helpers) => ({
  id: helpers.serial({primaryKey: true}),
  name: helpers.varchar({length: 100, notNull: true}),
  age: helpers.int({notNull: true}),
  role: helpers.text({enum: ['admin', 'user'], notNull: true}),
  createdAt: helpers.timestamp({mode: 'date', notNull: true, defaultNow: true}),
}));
export const createdByCallback = prefixed('users', (helpers) => ({
  id: helpers.serial({primaryKey: true}),
  name: helpers.varchar({length: 100, notNull: true}),
  age: helpers.int({notNull: true}),
  role: helpers.text({enum: ['admin', 'user'], notNull: true}),
  createdAt: helpers.timestamp({mode: 'date', notNull: true, defaultNow: true}),
}));
export type CreatorPins = [
  Expect<Equal<typeof createdUsers, Users>>,
  Expect<Equal<typeof byCallback, Users>>,
  Expect<Equal<typeof createdByCallback, Users>>,
];

// ── refine keeps every column fact, key flags included ───────────────────────

type RefinedUsers = RefinedTable<Users, {name: {maxLength: 50}}>;
export type RefinePins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['primaryKey'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['autoincrement'], true>>,
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

// ── enums, tuple and object forms ────────────────────────────────────────────

export const withEnum = mysqlTable('with_enum', {
  mood: mysqlEnum('mood_col', ['sad', 'happy'], {notNull: true}),
  level: mysqlEnum({Low: 'low', High: 'high'} as const, {default: ['low']}),
  bare: mysqlEnum(['x', 'y']),
});
type WithEnum = MysqlTable<
  'with_enum',
  {
    mood: MysqlEnumCol<['sad', 'happy'], {notNull: true}>;
    level: MysqlEnumObjectCol<{Low: 'low'; High: 'high'}, {default: ['low']}>;
    bare: MysqlEnumCol<['x', 'y']>;
  },
  [],
  {mood: 'mood_col'}
>;
export type OnlyPgMysql_EnumPins = [
  Expect<Equal<typeof withEnum, WithEnum>>,
  Expect<Equal<InferSelectModel<WithEnum>, WithEnumSelectBefore>>,
  Expect<Equal<InferInsertModel<WithEnum>, WithEnumInsertBefore>>,
  Expect<Equal<InferSelectModel<WithEnum>, {mood: 'sad' | 'happy'; level: 'low' | 'high' | null; bare: 'x' | 'y' | null}>>,
  Expect<Equal<MysqlEnumObjectCol<{Low: 'low'; High: 'high'}>, MysqlEnumCol<['low', 'high']>>>,
];

// ── schemas ──────────────────────────────────────────────────────────────────

export const shop = mysqlSchema('shop');
export const shopItems = shop.table('items', {id: serial({primaryKey: true}), label: varchar('item_label', {length: 20})});
export const shopCallbackItems = shop.table('items', (helpers) => ({
  id: helpers.serial({primaryKey: true}),
  label: helpers.varchar('item_label', {length: 20}),
}));
export const shopView = shop.view('item_view', {label: varchar({length: 20})}).existing();
type Items = MysqlTable<'items', {id: Serial<{primaryKey: true}>; label: Varchar<{length: 20}>}, [], {label: 'item_label'}>;
export type OnlyPgMysql_SchemaPins = [
  Expect<Equal<typeof shopItems, Items>>,
  Expect<Equal<typeof shopCallbackItems, Items>>,
  Expect<Equal<typeof shopView, MysqlView<'item_view', {label: Varchar<{length: 20}>}>>>,
  Expect<Equal<(typeof shop)['schemaName'], 'shop'>>,
];

// ── view options ─────────────────────────────────────────────────────────────

export const optionView = mysqlView('options', {name: varchar('user_name', {length: 10, notNull: true})})
  .algorithm('merge')
  .sqlSecurity('invoker')
  .withCheckOption('cascaded')
  .existing();
type AnyViewBuilder = MysqlViewBuilder<'v', object, object>;
export type OnlyPgMysql_ViewOptionPins = [
  Expect<Equal<typeof optionView, MysqlView<'options', {name: Varchar<{length: 10; notNull: true}>}, {name: 'user_name'}>>>,
  Expect<Equal<InferSelectViewModel<typeof optionView>, OptionViewViewSelectBefore>>,
  Expect<Equal<Parameters<AnyViewBuilder['algorithm']>[0], MySqlViewAlgorithm>>,
  Expect<Equal<Parameters<AnyViewBuilder['sqlSecurity']>[0], MySqlViewSecurity>>,
  Expect<Equal<Parameters<AnyViewBuilder['withCheckOption']>[0], MySqlViewCheckOption | undefined>>,
];

// ── wrong modifiers are rejected ─────────────────────────────────────────────

// @ts-expect-error only pg, mysql: a modifier this column kind lacks is rejected
export type BadMod = Varchar<{autoincrement: true}>;
// @ts-expect-error another dialect's modifier is rejected
text({array: true});
// @ts-expect-error a references() target must be a tableRef(), which records its table
int({references: [() => users]});
// @ts-expect-error a stray key is rejected in a call
int({unsigned: true, onUpdateNow: true});
// @ts-expect-error a stray key is rejected in a column type
export type BadStrayKey = Varchar<{length: 10; autoincrement: true}>;
// @ts-expect-error a stray key is rejected in a named call
varchar('name', {length: 10, autoincrement: true});
// @ts-expect-error only mysql: autoincrement is the numeric kinds only
char({autoincrement: true});
// @ts-expect-error only mysql: onUpdateNow is timestamp only, in a column type
export type BadOnUpdateNow = Datetime<{onUpdateNow: true}>;
// @ts-expect-error only mysql: onUpdateNow is timestamp only, in a call
int({onUpdateNow: true});
// @ts-expect-error only mysql: defaultNow is timestamp only
text({defaultNow: true});
// @ts-expect-error only mysql: varchar needs its length
varchar();

// ── refinement rejections ────────────────────────────────────────────────────

// @ts-expect-error "nam" is not a column of the table
export type BadRefineKey = RefinedTable<Users, {nam: {minLength: 2}}>;
// @ts-expect-error a string column takes no numeric refinement
export type BadRefineParam = RefinedTable<Users, {name: {min: 2}}>;
// @ts-expect-error a boolean column carries no refinable format
refineTableType(mysqlTable('flags', {on: boolean()}), {on: {min: 1}});
// @ts-expect-error an enum column carries no refinable format
refineTableType(withEnum, {mood: {maxLength: 3}});
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
// toDrizzle keeps every format tag and nominal brand, so a queried row is its model.

export const boundaryUsers = mysqlTable('boundary_users', {
  name: varchar({length: 100, notNull: true}),
  age: int({notNull: true}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),
});
export const boundaryApi = refineTableType(boundaryUsers, {name: {minLength: 10}, age: {min: 18}});
export const boundaryQuery = myDb.select().from(toDrizzle(boundaryApi));
declare const boundaryRows: Awaited<typeof boundaryQuery>;
declare const newBoundary: InferInsertModel<typeof boundaryApi>;
declare const boundaryPatch: InferUpdateModel<typeof boundaryApi>;
export const rowIntoModel: InferSelectModel<typeof boundaryApi> = boundaryRows[0] as (typeof boundaryRows)[number];
export const rowsIntoModel: InferSelectModel<typeof boundaryApi>[] = boundaryRows;
export const insertFromModel = myDb.insert(toDrizzle(boundaryApi)).values([newBoundary, newBoundary]);
export const updateFromModel = myDb.update(toDrizzle(boundaryApi)).set(boundaryPatch);

type BoundaryId = String<{minLength: 1}, 'BoundaryId'>;
export const brandedTable = mysqlTable('boundary_branded', {
  id: varchar({length: 40, notNull: true, $type: $type<BoundaryId>()}),
});
export const brandedQuery = myDb.select().from(toDrizzle(brandedTable));
declare const brandedRows: Awaited<typeof brandedQuery>;
export const brandedRowIntoModel: InferSelectModel<typeof brandedTable> = brandedRows[0] as (typeof brandedRows)[number];

// A class or a Date in `$type` survives whole: a mapped type would flatten it into its members.
class Money {
  constructor(readonly cents: number) {}
}
export const classTable = mysqlTable('boundary_class', {
  at: varchar({length: 40, notNull: true, $type: $type<Date>()}),
  price: varchar({length: 40, notNull: true, $type: $type<Money>()}),
});

export type BoundaryPins = [
  Expect<Equal<(typeof boundaryRows)[number], InferSelectModel<typeof boundaryApi>>>,
  Expect<Equal<(typeof brandedRows)[number]['id'], BoundaryId>>,
  Expect<Equal<InferSelectModel<typeof brandedTable>['id'], BoundaryId>>,
  Expect<Equal<InferSelectModel<typeof classTable>['at'], Date>>,
  Expect<Equal<InferSelectModel<typeof classTable>['price'], Money>>,
];

// A readonly `$type` is refused rather than read as an array: the override is the mutable tuple `$type<T>()` returns.
// @ts-expect-error a readonly $type tuple
export type ReadonlyTyped = Varchar<{length: 40; notNull: true; $type: readonly [BoundaryId]}>;

// @ts-expect-error only mysql, sqlite: unique takes a name only
varchar({length: 5, unique: ['uq', {nulls: 'distinct'}]});
// @ts-expect-error real takes no mode
real({mode: 'number'});
// @ts-expect-error a modifier set to undefined, which recordColumn would throw on
real({notNull: undefined});
// @ts-expect-error a hand-written modifier set to undefined
export type UndefinedMod = Real<{notNull: undefined}>;
