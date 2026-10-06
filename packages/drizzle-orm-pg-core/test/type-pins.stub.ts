/* @mion-expect-error drizzle-mixed-types */
// Compare slim schemas with their Drizzle materializations.
/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the pg columns (checked by tsc, not executed): a builder table IS its hand-written twin,
// its models equal the models the chained system produced for the same table, and its queries type as raw drizzle's.

import type {
  BigInt64,
  Date as RTDate,
  Float,
  Int16,
  Int32,
  Integer as IntegerFormat,
  IP,
  MergeFormat,
  String,
  StringDate,
  StringDateTime,
  StringTime,
  UUID,
} from '@mionjs/run-types/formats';
import type {
  ColSpecOf,
  InferInsertModel,
  InferSelectModel,
  InferSelectViewModel,
  KeyFlagsOf,
  RefinedTable,
} from '@mionjs/drizzle-orm';
import {$type, refineTableType, sql, tableRef, type TableRef} from '@mionjs/drizzle-orm';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import * as dz from 'drizzle-orm/pg-core';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';
import type {ToDrizzleTable} from '../src/drizzle.ts';
import {toDrizzle} from '../src/drizzle.ts';
import type {
  Bigint,
  Bigserial,
  Bit,
  Boolean,
  Char,
  Cidr,
  CustomCol,
  Decimal,
  DoublePrecision,
  Geometry,
  Halfvec,
  Inet,
  Integer,
  Interval,
  Json,
  Jsonb,
  Line,
  Macaddr,
  Macaddr8,
  Numeric,
  PgDate,
  PgEnumCol,
  PgEnumObjectCol,
  PgTable,
  PgView,
  Point,
  Real,
  Serial,
  Smallint,
  Smallserial,
  Sparsevec,
  Text,
  Time,
  Timestamp,
  Uuid,
  Varchar,
  Vector,
} from '../src/index.ts';
import {
  bigint,
  bigserial,
  bit,
  boolean,
  char,
  cidr,
  customType,
  date,
  decimal,
  doublePrecision,
  geometry,
  halfvec,
  inet,
  integer,
  interval,
  json,
  jsonb,
  line,
  macaddr,
  macaddr8,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgSchema,
  pgTable,
  pgTableCreator,
  pgView,
  point,
  real,
  serial,
  smallint,
  smallserial,
  sparsevec,
  text,
  time,
  timestamp,
  uuid,
  varchar,
  vector,
} from '../src/index.ts';

// ── the models the chained system produced, captured before the switch ────────

type CountersInsertBefore = {label: String; byDefault?: IntegerFormat | undefined};
type EveryInsertBefore = {
  bigint?: IntegerFormat | null | undefined;
  bigserial?: BigInt64 | undefined;
  bit?: String<{length: 8}> | null | undefined;
  boolean?: boolean | null | undefined;
  char?: String<{length: 3}> | null | undefined;
  cidr?: string | null | undefined;
  date?: StringDate | null | undefined;
  decimal?: string | null | undefined;
  doublePrecision?: Float | null | undefined;
  geometry?: {x: number; y: number} | null | undefined;
  halfvec?: number[] | null | undefined;
  inet?: IP | null | undefined;
  integer?: Int32 | null | undefined;
  interval?: string | null | undefined;
  json?: unknown;
  jsonb?: unknown;
  line?: {a: number; b: number; c: number} | null | undefined;
  macaddr?: string | null | undefined;
  macaddr8?: string | null | undefined;
  numeric?: string | null | undefined;
  point?: [number, number] | null | undefined;
  real?: Float | null | undefined;
  serial?: Int32 | undefined;
  smallint?: Int16 | null | undefined;
  smallserial?: Int16 | undefined;
  sparsevec?: string | null | undefined;
  text?: String | null | undefined;
  time?: StringTime | null | undefined;
  timestamp?: RTDate | null | undefined;
  uuid?: UUID | null | undefined;
  varchar?: String<{maxLength: 10}> | null | undefined;
  vector?: number[] | null | undefined;
  mood?: 'a' | 'b' | null | undefined;
  citext?: {x: number; y: number} | null | undefined;
};
type UsersInsertBefore = {
  id: UUID;
  name: String<{maxLength: 100}>;
  age: Int32;
  role: 'admin' | 'user';
  createdAt?: RTDate | undefined;
};
type WideInsertBefore = {
  role: 'admin' | 'user';
  tags: String[];
  id?: Int32 | undefined;
  payload?: {kind: string} | null | undefined;
  email?: String | null | undefined;
  slug?: String<{maxLength: 20}> | null | undefined;
  touchedAt?: RTDate | null | undefined;
  createdAt?: RTDate | undefined;
};
type WithEnumInsertBefore = {
  mood: 'sad' | 'happy';
  level?: 'low' | 'high' | null | undefined;
  bare?: 'sad' | 'happy' | null | undefined;
};
type EverySelectBefore = {
  bigint: IntegerFormat | null;
  bigserial: BigInt64;
  bit: String<{length: 8}> | null;
  boolean: boolean | null;
  char: String<{length: 3}> | null;
  cidr: string | null;
  date: StringDate | null;
  decimal: string | null;
  doublePrecision: Float | null;
  geometry: {x: number; y: number} | null;
  halfvec: number[] | null;
  inet: IP | null;
  integer: Int32 | null;
  interval: string | null;
  json: unknown;
  jsonb: unknown;
  line: {a: number; b: number; c: number} | null;
  macaddr: string | null;
  macaddr8: string | null;
  numeric: string | null;
  point: [number, number] | null;
  real: Float | null;
  serial: Int32;
  smallint: Int16 | null;
  smallserial: Int16;
  sparsevec: string | null;
  text: String | null;
  time: StringTime | null;
  timestamp: RTDate | null;
  uuid: UUID | null;
  varchar: String<{maxLength: 10}> | null;
  vector: number[] | null;
  mood: 'a' | 'b' | null;
  citext: {x: number; y: number} | null;
};
type UsersSelectBefore = {id: UUID; name: String<{maxLength: 100}>; age: Int32; role: 'admin' | 'user'; createdAt: RTDate};
type WideSelectBefore = {
  id: Int32;
  role: 'admin' | 'user';
  seq: Int32;
  tags: String[];
  payload: {kind: string} | null;
  email: String | null;
  slug: String<{maxLength: 20}> | null;
  touchedAt: RTDate | null;
  total: Int32 | null;
  createdAt: RTDate;
};
type WithEnumSelectBefore = {mood: 'sad' | 'happy'; level: 'low' | 'high' | null; bare: 'sad' | 'happy' | null};
type ActiveViewViewSelectBefore = {name: String<{maxLength: 10}>};
type SecureViewViewSelectBefore = {name: String<{maxLength: 10}> | null};
type TotalsViewSelectBefore = {total: Int32};
type UsersUpdateBefore = {
  id?: UUID | undefined;
  name?: String<{maxLength: 100}> | undefined;
  age?: Int32 | undefined;
  role?: 'admin' | 'user' | undefined;
  createdAt?: RTDate | undefined;
};
type WideUpdateBefore = {
  id?: Int32 | undefined;
  role?: 'admin' | 'user' | undefined;
  tags?: String[] | undefined;
  payload?: {kind: string} | null | undefined;
  email?: String | null | undefined;
  slug?: String<{maxLength: 20}> | null | undefined;
  touchedAt?: RTDate | null | undefined;
  createdAt?: RTDate | undefined;
};
type UsersRefinedInsertBefore = {
  id: UUID;
  name: MergeFormat<String<{maxLength: 100}>, {maxLength: 50}>;
  age: Int32;
  role: 'admin' | 'user';
  createdAt?: RTDate | undefined;
};
type UsersRefinedSelectBefore = {
  id: UUID;
  name: MergeFormat<String<{maxLength: 100}>, {maxLength: 50}>;
  age: Int32;
  role: 'admin' | 'user';
  createdAt: RTDate;
};

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type DataOf<C> = ColSpecOf<C> extends {data: infer D} ? D : never;

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
export const rawUsers = dz.pgTable('users', {
  id: dz.uuid().primaryKey(),
  name: dz.varchar({length: 100}).notNull(),
  age: dz.integer().notNull(),
  role: dz.text({enum: ['admin', 'user']}).notNull(),
  createdAt: dz.timestamp({mode: 'date'}).notNull().defaultNow(),
});

// With one call per column, a builder column IS the hand-written column, even outside a table.
export const looseVarchar = varchar({length: 100, notNull: true, unique: ['uq_name', {nulls: 'not distinct'}]});
export const looseInteger = integer({notNull: true, default: [21]});
export const looseIdentity = integer({generatedAlwaysAsIdentity: [{startWith: 10}]});
export type LoosePins = [
  Expect<Equal<typeof looseVarchar, Varchar<{length: 100; notNull: true; unique: ['uq_name', {nulls: 'not distinct'}]}>>>,
  Expect<Equal<typeof looseInteger, Integer<{notNull: true; default: [21]}>>>,
  Expect<Equal<typeof looseIdentity, Integer<{generatedAlwaysAsIdentity: [{startWith: 10}]}>>>,
];

export type NarrowPins = [
  Expect<Equal<typeof users, Users>>,
  Expect<Equal<InferSelectModel<Users>, UsersSelectBefore>>,
  Expect<Equal<InferInsertModel<Users>, UsersInsertBefore>>,
  Expect<Equal<Partial<InferInsertModel<Users>>, UsersUpdateBefore>>,
];

// ── mode and config pick the data type ───────────────────────────────────────

export const modes = {
  timestampDate: timestamp({mode: 'date'}),
  timestampString: timestamp({mode: 'string'}),
  dateDate: date({mode: 'date'}),
  dateString: date({mode: 'string'}),
  bigNumber: bigint({mode: 'number'}),
  bigBig: bigint({mode: 'bigint'}),
  numericNumber: numeric({mode: 'number', precision: 10, scale: 2}),
  numericBigint: numeric({mode: 'bigint'}),
  bareNumeric: numeric(),
  bareTimestamp: timestamp(),
  bareDate: date(),
};
export type ModePins = [
  Expect<Equal<DataOf<typeof modes.timestampDate>, RTDate>>,
  Expect<Equal<DataOf<typeof modes.timestampString>, StringDateTime>>,
  Expect<Equal<DataOf<typeof modes.dateDate>, RTDate>>,
  Expect<Equal<DataOf<typeof modes.dateString>, StringDate>>,
  Expect<Equal<DataOf<typeof modes.bigNumber>, IntegerFormat>>,
  Expect<Equal<DataOf<typeof modes.bigBig>, BigInt64>>,
  Expect<Equal<DataOf<typeof modes.numericNumber>, Float>>,
  Expect<Equal<DataOf<typeof modes.numericBigint>, bigint>>,
  Expect<Equal<DataOf<typeof modes.bareNumeric>, string>>,
  Expect<Equal<DataOf<typeof modes.bareTimestamp>, RTDate>>,
  Expect<Equal<DataOf<typeof modes.bareDate>, StringDate>>,
  Expect<Equal<typeof modes.bigBig, Bigint<{mode: 'bigint'}>>>,
  Expect<Equal<typeof modes.numericNumber, Numeric<{mode: 'number'; precision: 10; scale: 2}>>>,
  Expect<Equal<typeof modes.timestampString, Timestamp<{mode: 'string'}>>>,
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

// ── every builder ────────────────────────────────────────────────────────────

const citext = customType<{data: {x: number; y: number}}>({dataType: () => 'citext'});
const everyMood = pgEnum('every_mood', ['a', 'b']);
export const every = pgTable('every', {
  bigint: bigint({mode: 'number'}),
  bigserial: bigserial({mode: 'bigint'}),
  bit: bit({dimensions: 8}),
  boolean: boolean(),
  char: char({length: 3}),
  cidr: cidr(),
  date: date(),
  decimal: decimal({precision: 10, scale: 2}),
  doublePrecision: doublePrecision(),
  geometry: geometry({mode: 'xy'}),
  halfvec: halfvec({dimensions: 3}),
  inet: inet(),
  integer: integer(),
  interval: interval({fields: 'day'}),
  json: json(),
  jsonb: jsonb(),
  line: line({mode: 'abc'}),
  macaddr: macaddr(),
  macaddr8: macaddr8(),
  numeric: numeric(),
  point: point(),
  real: real(),
  serial: serial(),
  smallint: smallint(),
  smallserial: smallserial(),
  sparsevec: sparsevec({dimensions: 5}),
  text: text(),
  time: time({precision: 3}),
  timestamp: timestamp(),
  uuid: uuid(),
  varchar: varchar({length: 10}),
  vector: vector({dimensions: 3}),
  mood: everyMood(),
  citext: citext(),
});
type Every = PgTable<
  'every',
  {
    bigint: Bigint<{mode: 'number'}>;
    bigserial: Bigserial<{mode: 'bigint'}>;
    bit: Bit<{dimensions: 8}>;
    boolean: Boolean;
    char: Char<{length: 3}>;
    cidr: Cidr;
    date: PgDate;
    decimal: Decimal<{precision: 10; scale: 2}>;
    doublePrecision: DoublePrecision;
    geometry: Geometry<{mode: 'xy'}>;
    halfvec: Halfvec<{dimensions: 3}>;
    inet: Inet;
    integer: Integer;
    interval: Interval<{fields: 'day'}>;
    json: Json;
    jsonb: Jsonb;
    line: Line<{mode: 'abc'}>;
    macaddr: Macaddr;
    macaddr8: Macaddr8;
    numeric: Numeric;
    point: Point;
    real: Real;
    serial: Serial;
    smallint: Smallint;
    smallserial: Smallserial;
    sparsevec: Sparsevec<{dimensions: 5}>;
    text: Text;
    time: Time<{precision: 3}>;
    timestamp: Timestamp;
    uuid: Uuid;
    varchar: Varchar<{length: 10}>;
    vector: Vector<{dimensions: 3}>;
    mood: PgEnumCol<['a', 'b']>;
    citext: CustomCol<{x: number; y: number}>;
  }
>;

export type EveryPins = [
  Expect<Equal<typeof every, Every>>,
  Expect<Equal<InferSelectModel<Every>, EverySelectBefore>>,
  Expect<Equal<InferInsertModel<Every>, EveryInsertBefore>>,
  // Every column is optional on insert, so the update model is the insert one.
  Expect<Equal<Partial<InferInsertModel<Every>>, EveryInsertBefore>>,
];

// ── wide vocabulary: pg's own modifiers, runtime callbacks and generated columns ──

export const wide = pgTable('w', {
  id: serial('id', {primaryKey: true}),
  role: text('role', {enum: ['admin', 'user'], notNull: true}),
  seq: integer('seq', {generatedAlwaysAsIdentity: true}),
  tags: text('tags', {array: true, notNull: true}),
  payload: jsonb('payload', {$type: $type<{kind: string}>()}),
  email: text('email', {unique: ['uq_email']}),
  slug: varchar('slug', {length: 20, $defaultFn: [() => 'x']}),
  touchedAt: timestamp('touched_at', {$onUpdate: [() => new Date()]}),
  total: integer('total', {generatedAlwaysAs: [2]}),
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
    slug: Varchar<{length: 20; $defaultFn: true}>;
    touchedAt: Timestamp<{$onUpdate: true}>;
    total: Integer<{generatedAlwaysAs: [2]}>;
    createdAt: Timestamp<{mode: 'date'; notNull: true; defaultNow: true}>;
  },
  [],
  {touchedAt: 'touched_at'; createdAt: 'created_at'}
>;

export type WidePins = [
  Expect<Equal<typeof wide, Wide>>,
  Expect<Equal<InferSelectModel<Wide>, WideSelectBefore>>,
  Expect<Equal<InferInsertModel<Wide>, WideInsertBefore>>,
  Expect<Equal<Partial<InferInsertModel<Wide>>, WideUpdateBefore>>,
  // A runtime default and an update callback make the column optional on insert; a generated one leaves it out.
  Expect<Equal<undefined extends InferInsertModel<Wide>['slug'] ? true : false, true>>,
  Expect<Equal<undefined extends InferInsertModel<Wide>['touchedAt'] ? true : false, true>>,
  Expect<Equal<'total' extends keyof InferInsertModel<Wide> ? true : false, false>>,
];

// ── the key flags drizzle reads ──────────────────────────────────────────────

export type KeyFlagPins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<Uuid<{primaryKey: true}>>>['primaryKey'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Uuid>>['primaryKey'], false>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer<{generatedAlwaysAsIdentity: true}>>>['identity'], 'always'>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer<{generatedByDefaultAsIdentity: true}>>>['identity'], 'byDefault'>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Integer>>['identity'], undefined>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<Varchar<{length: 8; $defaultFn: true}>>>['runtimeDefault'], true>>,
];

// ── the column flags ToDrizzleTable hands drizzle ────────────────────────────

type DzWide = ToDrizzleTable<Wide>;
export type ToDrizzleFlagPins = [
  Expect<Equal<DzWide['role']['_']['notNull'], true>>,
  Expect<Equal<DzWide['payload']['_']['notNull'], false>>,
  Expect<Equal<DzWide['id']['_']['hasDefault'], true>>,
  Expect<Equal<DzWide['slug']['_']['hasDefault'], true>>,
  Expect<Equal<DzWide['email']['_']['hasDefault'], false>>,
  Expect<Equal<DzWide['seq']['_']['identity'], 'always'>>,
  Expect<Equal<DzWide['seq']['_']['generated'], undefined>>,
  Expect<Equal<DzWide['total']['_']['identity'], undefined>>,
  Expect<Equal<DzWide['total']['_']['generated'] extends {type: 'always'} ? true : false, true>>,
];

// ── queries through drizzle's database type ──────────────────────────────────

declare const pgDb: PgDatabase<PgQueryResultHKT>;
export const dzUsers = toDrizzle(users);
export const selected = pgDb.select().from(dzUsers);
export const inserted = pgDb.insert(dzUsers).values({id: 'a', name: 'a', age: 1, role: 'admin'}).returning();
export const updated = pgDb.update(dzUsers).set({age: 2}).returning({id: dzUsers.id});
export const rawSelected = pgDb.select().from(rawUsers);
export const rawInserted = pgDb.insert(rawUsers).values({id: 'a', name: 'a', age: 1, role: 'admin'}).returning();
export const rawUpdated = pgDb.update(rawUsers).set({age: 2}).returning({id: rawUsers.id});
type InsertValues<Q> = Q extends {values(value: infer V): unknown} ? V : never;
type UpdateSet<Q> = Q extends {set(values: infer V): unknown} ? V : never;
export type QueryPins = [
  Expect<Equal<Awaited<typeof selected>[number], InferSelectModel<typeof users>>>,
  Expect<Equal<Awaited<typeof inserted>[number], InferSelectModel<typeof users>>>,
  Expect<Equal<Awaited<typeof updated>[number], {id: InferSelectModel<typeof users>['id']}>>,
  Expect<Equal<keyof Awaited<typeof selected>[number], 'id' | 'name' | 'age' | 'role' | 'createdAt'>>,
];
// a format tag is optional, so drizzle's plain values still go in
export const plainInsertIn: InsertValues<ReturnType<typeof pgDb.insert<typeof dzUsers>>> = {} as InsertValues<
  ReturnType<typeof pgDb.insert<typeof rawUsers>>
>;
export const plainSetIn: UpdateSet<ReturnType<typeof pgDb.update<typeof dzUsers>>> = {} as UpdateSet<
  ReturnType<typeof pgDb.update<typeof rawUsers>>
>;
export const rowAsRaw: Awaited<typeof rawSelected>[number] = {} as Awaited<typeof selected>[number];

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

// ── views ────────────────────────────────────────────────────────────────────

export const activeView = pgView('active', {name: varchar('user_name', {length: 10, notNull: true})}).existing();
type ActiveView = PgView<'active', {name: Varchar<{length: 10; notNull: true}>}, {name: 'user_name'}>;

export type ViewPins = [
  Expect<Equal<typeof activeView, ActiveView>>,
  Expect<Equal<InferSelectViewModel<ActiveView>, ActiveViewViewSelectBefore>>,
];
// @ts-expect-error the query-builder form has no columns to type, so it has no as()
pgView('from_query').as(sql`select 1`);

// ── table creators and the columns callback ──────────────────────────────────

export const prefixed = pgTableCreator((name) => `app_${name}`);
export const createdUsers = prefixed('users', {
  id: uuid({primaryKey: true}),
  name: varchar({length: 100, notNull: true}),
  age: integer({notNull: true}),
  role: text({enum: ['admin', 'user'], notNull: true}),
  createdAt: timestamp({mode: 'date', notNull: true, defaultNow: true}),
});
export const byCallback = pgTable('users', (helpers) => ({
  id: helpers.uuid({primaryKey: true}),
  name: helpers.varchar({length: 100, notNull: true}),
  age: helpers.integer({notNull: true}),
  role: helpers.text({enum: ['admin', 'user'], notNull: true}),
  createdAt: helpers.timestamp({mode: 'date', notNull: true, defaultNow: true}),
}));
export const createdByCallback = prefixed('users', (helpers) => ({
  id: helpers.uuid({primaryKey: true}),
  name: helpers.varchar({length: 100, notNull: true}),
  age: helpers.integer({notNull: true}),
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
type RefinedWide = RefinedTable<Wide, {email: {maxLength: 50}}>;
export type RefinePins = [
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedUsers['columns']['id']>>['primaryKey'], true>>,
  Expect<Equal<KeyFlagsOf<ColSpecOf<RefinedWide['columns']['seq']>>['identity'], 'always'>>,
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

export const mood = pgEnum('mood', ['sad', 'happy']);
export const level = pgEnum('level', {Low: 'low', High: 'high'} as const);
export const withEnum = pgTable('with_enum', {
  mood: mood('mood_col', {notNull: true}),
  level: level({default: ['low']}),
  bare: mood(),
});
type WithEnum = PgTable<
  'with_enum',
  {
    mood: PgEnumCol<['sad', 'happy'], {notNull: true}>;
    level: PgEnumObjectCol<{Low: 'low'; High: 'high'}, {default: ['low']}>;
    bare: PgEnumCol<['sad', 'happy']>;
  },
  [],
  {mood: 'mood_col'}
>;
export type OnlyPgMysql_EnumPins = [
  Expect<Equal<typeof withEnum, WithEnum>>,
  Expect<Equal<InferSelectModel<WithEnum>, WithEnumSelectBefore>>,
  Expect<Equal<InferInsertModel<WithEnum>, WithEnumInsertBefore>>,
  Expect<Equal<InferSelectModel<WithEnum>, {mood: 'sad' | 'happy'; level: 'low' | 'high' | null; bare: 'sad' | 'happy' | null}>>,
  Expect<Equal<PgEnumObjectCol<{Low: 'low'; High: 'high'}>, PgEnumCol<['low', 'high']>>>,
];

// ── schemas ──────────────────────────────────────────────────────────────────

export const shop = pgSchema('shop');
export const shopItems = shop.table('items', {id: serial({primaryKey: true}), label: varchar('item_label', {length: 20})});
export const shopView = shop.view('item_view', {label: varchar({length: 20})}).existing();
export const shopMaterialized = shop.materializedView('item_mview', {label: varchar({length: 20})}).existing();
export const shopStatus = shop.enum('status', ['on', 'off']);
export const shopFlags = shop.table('flags', (helpers) => ({id: helpers.serial({primaryKey: true}), status: shopStatus()}));
type Items = PgTable<'items', {id: Serial<{primaryKey: true}>; label: Varchar<{length: 20}>}, [], {label: 'item_label'}>;
export type OnlyPgMysql_SchemaPins = [
  Expect<Equal<typeof shopItems, Items>>,
  Expect<Equal<typeof shopView, PgView<'item_view', {label: Varchar<{length: 20}>}>>>,
  Expect<Equal<typeof shopMaterialized, PgView<'item_mview', {label: Varchar<{length: 20}>}>>>,
  Expect<Equal<typeof shopFlags, PgTable<'flags', {id: Serial<{primaryKey: true}>; status: PgEnumCol<['on', 'off']>}>>>,
];

// ── view options ─────────────────────────────────────────────────────────────

export const secureView = pgView('secure', {name: varchar('user_name', {length: 10})})
  .with({securityBarrier: true, checkOption: 'cascaded'})
  .existing();
export type OnlyPgMysql_ViewOptionPins = [
  Expect<Equal<typeof secureView, PgView<'secure', {name: Varchar<{length: 10}>}, {name: 'user_name'}>>>,
  Expect<Equal<InferSelectViewModel<typeof secureView>, SecureViewViewSelectBefore>>,
];

// ── identity columns ─────────────────────────────────────────────────────────

export const counters = pgTable('counters', {
  always: integer({generatedAlwaysAsIdentity: [{startWith: 10}]}),
  byDefault: bigint({mode: 'number', generatedByDefaultAsIdentity: true}),
  label: text({notNull: true}),
});
// An always identity leaves insert unless overridingSystemValue() puts it back.
export const overridden = pgDb.insert(toDrizzle(counters)).overridingSystemValue().values({always: 1, label: 'a'});
export type OnlyPg_IdentityPins = [
  Expect<
    Equal<
      typeof counters,
      PgTable<
        'counters',
        {
          always: Integer<{generatedAlwaysAsIdentity: [{startWith: 10}]}>;
          byDefault: Bigint<{mode: 'number'; generatedByDefaultAsIdentity: true}>;
          label: Text<{notNull: true}>;
        }
      >
    >
  >,
  Expect<Equal<InferInsertModel<typeof counters>, CountersInsertBefore>>,
  Expect<Equal<'always' extends keyof InferInsertModel<typeof counters> ? true : false, false>>,
  Expect<Equal<ToDrizzleTable<typeof counters>['always']['_']['identity'], 'always'>>,
  Expect<Equal<ToDrizzleTable<typeof counters>['byDefault']['_']['identity'], 'byDefault'>>,
  Expect<Equal<ToDrizzleTable<typeof counters>['byDefault']['_']['generated'], undefined>>,
];

// ── materialized views ───────────────────────────────────────────────────────

export const totals = pgMaterializedView('totals', {total: integer('total_count', {notNull: true})})
  .with({fillfactor: 90})
  .using('heap')
  .tablespace('fast_space')
  .withNoData()
  .existing();
export type OnlyPg_MaterializedViewPins = [
  Expect<Equal<typeof totals, PgView<'totals', {total: Integer<{notNull: true}>}, {total: 'total_count'}>>>,
  Expect<Equal<InferSelectViewModel<typeof totals>, TotalsViewSelectBefore>>,
];
// @ts-expect-error only pg: a materialized view's query-builder form has no as() either
pgMaterializedView('from_query').as(sql`select 1`);

// ── wrong modifiers are rejected ─────────────────────────────────────────────

// @ts-expect-error only pg, mysql: a modifier this column kind lacks is rejected
export type BadMod = Varchar<{defaultNow: true}>;
// @ts-expect-error only pg: identity is the int kinds only
varchar({generatedAlwaysAsIdentity: true});
// @ts-expect-error another dialect's modifier is rejected
integer({autoincrement: true});
// @ts-expect-error a references() target must be a tableRef(), which records its table
integer({references: [() => users]});
// @ts-expect-error a stray key is rejected in a call
integer({notNull: true, defaultNow: true});
// @ts-expect-error a stray key is rejected in a column type
export type BadStrayKey = Varchar<{length: 10; defaultNow: true}>;
// @ts-expect-error a stray key is rejected in a named call
varchar('name', {length: 10, generatedAlwaysAsIdentity: true});

// ── refinement rejections ────────────────────────────────────────────────────

// @ts-expect-error "nam" is not a column of the table
export type BadRefineKey = RefinedTable<Users, {nam: {minLength: 2}}>;
// @ts-expect-error a string column takes no numeric refinement
export type BadRefineParam = RefinedTable<Users, {name: {min: 2}}>;
// @ts-expect-error a boolean column carries no refinable format
refineTableType(pgTable('flags', {on: boolean()}), {on: {min: 1}});
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
export type ViewNotUpdateModel = Partial<InferInsertModel<typeof activeView>>;

// ── the slim <-> drizzle boundary ────────────────────────────────────────────
// toDrizzle keeps every format tag and nominal brand, so a queried row is its model.

export const boundaryUsers = pgTable('boundary_users', {
  name: varchar({length: 100, notNull: true}),
  age: integer({notNull: true}),
  createdAt: timestamp('created_at', {mode: 'date', notNull: true, defaultNow: true}),
});
export const boundaryApi = refineTableType(boundaryUsers, {name: {minLength: 10}, age: {min: 18}});
export const boundaryQuery = pgDb.select().from(toDrizzle(boundaryApi));
declare const boundaryRows: Awaited<typeof boundaryQuery>;
declare const newBoundary: InferInsertModel<typeof boundaryApi>;
declare const boundaryPatch: Partial<InferInsertModel<typeof boundaryApi>>;
export const rowIntoModel: InferSelectModel<typeof boundaryApi> = boundaryRows[0] as (typeof boundaryRows)[number];
export const rowsIntoModel: InferSelectModel<typeof boundaryApi>[] = boundaryRows;
export const insertFromModel = pgDb.insert(toDrizzle(boundaryApi)).values([newBoundary, newBoundary]);
export const updateFromModel = pgDb.update(toDrizzle(boundaryApi)).set(boundaryPatch);

type BoundaryId = String<{minLength: 1}, 'BoundaryId'>;
export const brandedTable = pgTable('boundary_branded', {id: varchar({length: 40, notNull: true, $type: $type<BoundaryId>()})});
export const brandedQuery = pgDb.select().from(toDrizzle(brandedTable));
declare const brandedRows: Awaited<typeof brandedQuery>;
export const brandedRowIntoModel: InferSelectModel<typeof brandedTable> = brandedRows[0] as (typeof brandedRows)[number];

// A class or a Date in `$type` survives whole: a mapped type would flatten it into its members.
class Money {
  constructor(readonly cents: number) {}
}
export const classTable = pgTable('boundary_class', {
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

// @ts-expect-error real takes no mode
real({mode: 'number'});
// @ts-expect-error a modifier set to undefined, which recordColumn would throw on
real({notNull: undefined});
// @ts-expect-error a hand-written modifier set to undefined
export type UndefinedMod = Real<{notNull: undefined}>;

// ── drizzle's $inferSelect / $inferInsert ────────────────────────────────────
// type only: nothing holds these members at run time

export type InferMemberPins = [
  Expect<Equal<(typeof users)['$inferSelect'], InferSelectModel<typeof users>>>,
  Expect<Equal<(typeof users)['$inferInsert'], InferInsertModel<typeof users>>>,
  Expect<Equal<Users['$inferSelect'], InferSelectModel<Users>>>,
  Expect<Equal<Users['$inferInsert'], InferInsertModel<Users>>>,
  Expect<Equal<(typeof activeView)['$inferSelect'], InferSelectViewModel<typeof activeView>>>,
  Expect<Equal<ReturnType<(typeof users)['enableRLS']>['$inferSelect'], InferSelectModel<typeof users>>>,
];
