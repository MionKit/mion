/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the side-by-side pg columns (checked by tsc, not executed): a builder table
// IS its hand-written twin, and its models equal the shipped system's models for the same table.

import type {
  BigInt64,
  Date as RTDate,
  Float,
  Integer as IntegerFormat,
  StringDate,
  StringDateTime,
} from '@mionjs/run-types/formats';
import type {
  InferInsertModel,
  InferSelectModel,
  InferSelectViewModel,
  InferUpdateModel,
} from '../../../drizzle-orm/src/models.ts';
import type {RefinedTable as CurRefinedTable} from '../../../drizzle-orm/src/refine.ts';
import type {ColSpecOf, KeyFlagsOf, RefinedTable} from '../../../drizzle-orm/next/index.ts';
import type {InferSelectModel as DzInferSelectModel} from 'drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';
import type {ToDrizzleTable} from '../../next/drizzle.ts';
import {toDrizzle} from '../../next/drizzle.ts';
import {toDrizzle as curToDrizzle} from '../../src/drizzle.ts';
import type * as next from '../../../drizzle-orm/next/models.ts';
import {$type, tableRef, type TableRef} from '../../../drizzle-orm/next/index.ts';
import {sql} from '../../../drizzle-orm/src/recorder.ts';
import * as cur from '../../src/index.ts';
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
} from '../../next/index.ts';
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
} from '../../next/index.ts';

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
export const looseIdentity = integer({generatedAlwaysAsIdentity: [{startWith: 10}]});
export type LoosePins = [
  Expect<Equal<typeof looseVarchar, Varchar<{length: 100; notNull: true; unique: ['uq_name', {nulls: 'not distinct'}]}>>>,
  Expect<Equal<typeof looseInteger, Integer<{notNull: true; default: [21]}>>>,
  Expect<Equal<typeof looseIdentity, Integer<{generatedAlwaysAsIdentity: [{startWith: 10}]}>>>,
];

export type NarrowPins = [
  Expect<Equal<typeof users, Users>>,
  Expect<Equal<next.InferSelectModel<Users>, InferSelectModel<typeof curUsers>>>,
  Expect<Equal<next.InferInsertModel<Users>, InferInsertModel<typeof curUsers>>>,
  Expect<Equal<next.InferUpdateModel<Users>, InferUpdateModel<typeof curUsers>>>,
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
export const curEvery = cur.pgTable('every', {
  bigint: cur.bigint({mode: 'number'}),
  bigserial: cur.bigserial({mode: 'bigint'}),
  bit: cur.bit({dimensions: 8}),
  boolean: cur.boolean(),
  char: cur.char({length: 3}),
  cidr: cur.cidr(),
  date: cur.date(),
  decimal: cur.decimal({precision: 10, scale: 2}),
  doublePrecision: cur.doublePrecision(),
  geometry: cur.geometry({mode: 'xy'}),
  halfvec: cur.halfvec({dimensions: 3}),
  inet: cur.inet(),
  integer: cur.integer(),
  interval: cur.interval({fields: 'day'}),
  json: cur.json(),
  jsonb: cur.jsonb(),
  line: cur.line({mode: 'abc'}),
  macaddr: cur.macaddr(),
  macaddr8: cur.macaddr8(),
  numeric: cur.numeric(),
  point: cur.point(),
  real: cur.real(),
  serial: cur.serial(),
  smallint: cur.smallint(),
  smallserial: cur.smallserial(),
  sparsevec: cur.sparsevec({dimensions: 5}),
  text: cur.text(),
  time: cur.time({precision: 3}),
  timestamp: cur.timestamp(),
  uuid: cur.uuid(),
  varchar: cur.varchar({length: 10}),
  vector: cur.vector({dimensions: 3}),
  mood: cur.pgEnum('every_mood', ['a', 'b'])(),
  citext: cur.customType<{data: {x: number; y: number}}>({dataType: () => 'citext'})(),
});

export type EveryPins = [
  Expect<Equal<typeof every, Every>>,
  Expect<Equal<next.InferSelectModel<Every>, InferSelectModel<typeof curEvery>>>,
  Expect<Equal<next.InferInsertModel<Every>, InferInsertModel<typeof curEvery>>>,
  Expect<Equal<next.InferUpdateModel<Every>, InferUpdateModel<typeof curEvery>>>,
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
export const curWide = cur.pgTable('w', {
  id: cur.serial('id').primaryKey(),
  role: cur.text('role', {enum: ['admin', 'user']}).notNull(),
  seq: cur.integer('seq').generatedAlwaysAsIdentity(),
  tags: cur.text('tags').array().notNull(),
  payload: cur.jsonb('payload').$type<{kind: string}>(),
  email: cur.text('email').unique('uq_email'),
  slug: cur.varchar('slug', {length: 20}).$defaultFn(() => 'x'),
  touchedAt: cur.timestamp('touched_at').$onUpdate(() => new Date()),
  total: cur.integer('total').generatedAlwaysAs(2),
  createdAt: cur.timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});

export type WidePins = [
  Expect<Equal<typeof wide, Wide>>,
  Expect<Equal<next.InferSelectModel<Wide>, InferSelectModel<typeof curWide>>>,
  Expect<Equal<next.InferInsertModel<Wide>, InferInsertModel<typeof curWide>>>,
  Expect<Equal<next.InferUpdateModel<Wide>, InferUpdateModel<typeof curWide>>>,
  // A runtime default and an update callback make the column optional on insert; a generated one leaves it out.
  Expect<Equal<undefined extends next.InferInsertModel<Wide>['slug'] ? true : false, true>>,
  Expect<Equal<undefined extends next.InferInsertModel<Wide>['touchedAt'] ? true : false, true>>,
  Expect<Equal<'total' extends keyof next.InferInsertModel<Wide> ? true : false, false>>,
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
export const curDzUsers = curToDrizzle(curUsers);
export const selected = pgDb.select().from(dzUsers);
export const curSelected = pgDb.select().from(curDzUsers);
export const inserted = pgDb.insert(dzUsers).values({id: 'a', name: 'a', age: 1, role: 'admin'}).returning();
export const curInserted = pgDb.insert(curDzUsers).values({id: 'a', name: 'a', age: 1, role: 'admin'}).returning();
export const updated = pgDb.update(dzUsers).set({age: 2}).returning({id: dzUsers.id});
export const curUpdated = pgDb.update(curDzUsers).set({age: 2}).returning({id: curDzUsers.id});
type InsertValues<Q> = Q extends {values(value: infer V): unknown} ? V : never;
type UpdateSet<Q> = Q extends {set(values: infer V): unknown} ? V : never;
export type QueryPins = [
  Expect<Equal<Awaited<typeof selected>, Awaited<typeof curSelected>>>,
  Expect<Equal<Awaited<typeof inserted>, Awaited<typeof curInserted>>>,
  Expect<Equal<Awaited<typeof updated>, Awaited<typeof curUpdated>>>,
  Expect<Equal<keyof Awaited<typeof selected>[number], 'id' | 'name' | 'age' | 'role' | 'createdAt'>>,
  Expect<
    Equal<
      InsertValues<ReturnType<typeof pgDb.insert<typeof dzUsers>>>,
      InsertValues<ReturnType<typeof pgDb.insert<typeof curDzUsers>>>
    >
  >,
  Expect<
    Equal<UpdateSet<ReturnType<typeof pgDb.update<typeof dzUsers>>>, UpdateSet<ReturnType<typeof pgDb.update<typeof curDzUsers>>>>
  >,
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

// ── views ────────────────────────────────────────────────────────────────────

export const activeView = pgView('active', {name: varchar('user_name', {length: 10, notNull: true})}).existing();
type ActiveView = PgView<'active', {name: Varchar<{length: 10; notNull: true}>}, {name: 'user_name'}>;
export const curActiveView = cur.pgView('active', {name: cur.varchar('user_name', {length: 10}).notNull()}).existing();

export type ViewPins = [
  Expect<Equal<typeof activeView, ActiveView>>,
  Expect<Equal<next.InferSelectViewModel<ActiveView>, InferSelectViewModel<typeof curActiveView>>>,
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
const curMood = cur.pgEnum('mood', ['sad', 'happy']);
export const curWithEnum = cur.pgTable('with_enum', {
  mood: curMood('mood_col').notNull(),
  level: cur
    .pgEnum('level', {Low: 'low', High: 'high'} as const)()
    .default('low'),
  bare: curMood(),
});
export type OnlyPgMysql_EnumPins = [
  Expect<Equal<typeof withEnum, WithEnum>>,
  Expect<Equal<next.InferSelectModel<WithEnum>, InferSelectModel<typeof curWithEnum>>>,
  Expect<Equal<next.InferInsertModel<WithEnum>, InferInsertModel<typeof curWithEnum>>>,
  Expect<
    Equal<next.InferSelectModel<WithEnum>, {mood: 'sad' | 'happy'; level: 'low' | 'high' | null; bare: 'sad' | 'happy' | null}>
  >,
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
export const curSecureView = cur
  .pgView('secure', {name: cur.varchar('user_name', {length: 10})})
  .with({securityBarrier: true, checkOption: 'cascaded'})
  .existing();
export type OnlyPgMysql_ViewOptionPins = [
  Expect<Equal<typeof secureView, PgView<'secure', {name: Varchar<{length: 10}>}, {name: 'user_name'}>>>,
  Expect<Equal<next.InferSelectViewModel<typeof secureView>, InferSelectViewModel<typeof curSecureView>>>,
];

// ── identity columns ─────────────────────────────────────────────────────────

export const counters = pgTable('counters', {
  always: integer({generatedAlwaysAsIdentity: [{startWith: 10}]}),
  byDefault: bigint({mode: 'number', generatedByDefaultAsIdentity: true}),
  label: text({notNull: true}),
});
export const curCounters = cur.pgTable('counters', {
  always: cur.integer().generatedAlwaysAsIdentity({startWith: 10}),
  byDefault: cur.bigint({mode: 'number'}).generatedByDefaultAsIdentity(),
  label: cur.text().notNull(),
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
  Expect<Equal<next.InferInsertModel<typeof counters>, InferInsertModel<typeof curCounters>>>,
  Expect<Equal<'always' extends keyof next.InferInsertModel<typeof counters> ? true : false, false>>,
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
export const curTotals = cur
  .pgMaterializedView('totals', {total: cur.integer('total_count').notNull()})
  .with({fillfactor: 90})
  .using('heap')
  .tablespace('fast_space')
  .withNoData()
  .existing();
export type OnlyPg_MaterializedViewPins = [
  Expect<Equal<typeof totals, PgView<'totals', {total: Integer<{notNull: true}>}, {total: 'total_count'}>>>,
  Expect<Equal<next.InferSelectViewModel<typeof totals>, InferSelectViewModel<typeof curTotals>>>,
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
