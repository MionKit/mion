/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the slim mysql surface (checked by tsc, not
// executed): mode/unsigned-dependent column types equal the builders'
// inferred data, the model rules hold, and the twin table (builders vs pure
// type) yields byte-identical models (the full rule matrix is pinned in the
// pg package; the shared machinery lives in @mionjs/drizzle-orm).

import type {
  BigInt64,
  BigUInt64,
  Date as RTDate,
  Integer as IntegerFormat,
  String as Str,
  StringDateTime,
  UInt8,
} from '@mionjs/run-types/formats';
import type {ColDataOf, InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import type {Bigint, Int, MysqlTable, Text, Timestamp, Tinyint, Varchar, Year} from './index.ts';
import {bigint, int, mysqlEnum, mysqlTable, mysqlView, serial, text, timestamp, tinyint, varchar, year} from './index.ts';

/** Data a column type carries (the builder-equivalence probe: a column type IS
 *  the branded column now, so this reads the same brand off both roads). */
type TypeRoadData<C> = ColDataOf<C>;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ── named type === builder data ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const namedPins = {
  bigNumber: bigint('b', {mode: 'number'}),
  bigBig: bigint('b2', {mode: 'bigint'}),
  bigUnsigned: bigint('b3', {mode: 'bigint', unsigned: true}),
  int: int('i'),
  intUnsigned: int('i2', {unsigned: true}),
  tinyUnsigned: tinyint('t', {unsigned: true}),
  year: year('y'),
  timestampString: timestamp('ts', {mode: 'string'}),
  timestampDate: timestamp('ts2'),
  enumCol: mysqlEnum('role', ['admin', 'user']),
  textEnum: text('plan', {enum: ['free', 'pro']}),
};
type _bigNumber = Expect<Equal<ColDataOf<(typeof namedPins)['bigNumber']>, TypeRoadData<Bigint<'b', {mode: 'number'}>>>>;
type _bigBig = Expect<Equal<ColDataOf<(typeof namedPins)['bigBig']>, TypeRoadData<Bigint<'b2', {mode: 'bigint'}>>>>;
type _bigUnsigned = Expect<
  Equal<ColDataOf<(typeof namedPins)['bigUnsigned']>, TypeRoadData<Bigint<'b3', {mode: 'bigint'; unsigned: true}>>>
>;
type _int = Expect<Equal<ColDataOf<(typeof namedPins)['int']>, TypeRoadData<Int<'i'>>>>;
type _intUnsigned = Expect<Equal<ColDataOf<(typeof namedPins)['intUnsigned']>, TypeRoadData<Int<'i2', {unsigned: true}>>>>;
type _tinyUnsigned = Expect<Equal<ColDataOf<(typeof namedPins)['tinyUnsigned']>, TypeRoadData<Tinyint<'t', {unsigned: true}>>>>;
type _year = Expect<Equal<ColDataOf<(typeof namedPins)['year']>, TypeRoadData<Year<'y'>>>>;
type _timestampString = Expect<
  Equal<ColDataOf<(typeof namedPins)['timestampString']>, TypeRoadData<Timestamp<'ts', {mode: 'string'}>>>
>;
type _timestampDate = Expect<Equal<ColDataOf<(typeof namedPins)['timestampDate']>, TypeRoadData<Timestamp<'ts2'>>>>;
// The column vocabulary also stands alone: the data a column type carries is
// exactly the core format the builder of the same call infers.
type _bigNumberIsInteger = Expect<Equal<TypeRoadData<Bigint<'b', {mode: 'number'}>>, IntegerFormat>>;
type _bigIsBigInt64 = Expect<Equal<TypeRoadData<Bigint<'b2', {mode: 'bigint'}>>, BigInt64>>;
type _bigConfigOnly = Expect<Equal<TypeRoadData<Bigint<{mode: 'bigint'; unsigned: true}>>, BigUInt64>>;
type _tinyIsUInt8 = Expect<Equal<TypeRoadData<Tinyint<{unsigned: true}>>, UInt8>>;
type _timestampIsDate = Expect<Equal<TypeRoadData<Timestamp>, RTDate>>;
type _timestampStringIsString = Expect<Equal<TypeRoadData<Timestamp<{mode: 'string'}>>, StringDateTime>>;
// mysqlEnum has no column type twin (its second arg is a values array, not a
// config object); the builder's inferred data is pinned directly.
type _enum = Expect<Equal<ColDataOf<(typeof namedPins)['enumCol']>, 'admin' | 'user'>>;
// The same literal union IS reachable on the type road: text/varchar/char take
// the enum in their config object, so Text<'plan', {enum: [...]}> twins
// text('plan', {enum: [...]}) and both convert.
type _textEnum = Expect<Equal<ColDataOf<(typeof namedPins)['textEnum']>, TypeRoadData<Text<'plan', {enum: ['free', 'pro']}>>>>;
type _textEnumUnion = Expect<Equal<TypeRoadData<Text<{enum: ['free', 'pro']}>>, 'free' | 'pro'>>;

// ── model rules ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
type User = InferSelectModel<typeof users>;
type NewUser = InferInsertModel<typeof users>;
type _serialSelect = Expect<Equal<User['id'], ColDataOf<ReturnType<typeof serial>>>>;
type _serialInsertOptional = Expect<Equal<NewUser['id'], User['id'] | undefined>>;
type _insertDefaultedOptional = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;

// ── type road ↔ builder road ─────────────────────────────────────────────────

// The same table written both ways yields byte-identical models, mysql's own
// modifiers (autoincrement, onUpdateNow) included.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const twinBuilders = mysqlTable('twins', {
  id: int('id', {unsigned: true}).autoincrement().primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  touchedAt: timestamp('touched_at').onUpdateNow(),
});
type TwinType = MysqlTable<
  'twins',
  {
    id: Int<'id', {unsigned: true; autoincrement: true; primaryKey: true}>;
    name: Varchar<'name', {length: 100; notNull: true}>;
    createdAt: Timestamp<'created_at', {notNull: true; defaultNow: true}>;
    touchedAt: Timestamp<'touched_at', {onUpdateNow: true}>;
  }
>;
type _twinSelect = Expect<Equal<InferSelectModel<typeof twinBuilders>, InferSelectModel<TwinType>>>;
type _twinInsert = Expect<Equal<InferInsertModel<typeof twinBuilders>, InferInsertModel<TwinType>>>;
type _twinUpdate = Expect<Equal<InferUpdateModel<typeof twinBuilders>, InferUpdateModel<TwinType>>>;
// autoincrement and onUpdateNow both give the column a database default.
type _twinAutoincrementOptional = Expect<
  Equal<InferInsertModel<TwinType>['id'], TypeRoadData<Int<'id', {unsigned: true}>> | undefined>
>;
type _twinOnUpdateNowOptional = Expect<Equal<InferInsertModel<TwinType>['touchedAt'], RTDate | null | undefined>>;

// ── views: select-only models ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const pinnedView = mysqlView('pinned_view', {
  name: varchar('name', {length: 100}).notNull(),
  note: text('note'),
}).existing();
type PinnedRow = InferSelectViewModel<typeof pinnedView>;
type _viewSelectNotNull = Expect<Equal<PinnedRow['name'], Str<{maxLength: 100}>>>;
type _viewSelectNullable = Expect<Equal<PinnedRow['note'], Str | null>>;
// A view is READ-ONLY and is not a table: the three table models all reject it.
// @ts-expect-error InferSelectModel takes a table, a view uses InferSelectViewModel
type _viewNotSelectModel = InferSelectModel<typeof pinnedView>;
// @ts-expect-error a view has no insert model
type _viewNotInsertModel = InferInsertModel<typeof pinnedView>;
// @ts-expect-error a view has no update model
type _viewNotUpdateModel = InferUpdateModel<typeof pinnedView>;

export type _MySqlTypePins = [
  _bigNumber,
  _bigBig,
  _bigUnsigned,
  _int,
  _intUnsigned,
  _tinyUnsigned,
  _year,
  _timestampString,
  _timestampDate,
  _bigNumberIsInteger,
  _bigIsBigInt64,
  _bigConfigOnly,
  _tinyIsUInt8,
  _timestampIsDate,
  _timestampStringIsString,
  _enum,
  _textEnum,
  _textEnumUnion,
  _serialSelect,
  _serialInsertOptional,
  _insertDefaultedOptional,
  _twinSelect,
  _twinInsert,
  _twinUpdate,
  _twinAutoincrementOptional,
  _twinOnUpdateNowOptional,
  _viewSelectNotNull,
  _viewSelectNullable,
  _viewNotSelectModel,
  _viewNotInsertModel,
  _viewNotUpdateModel,
];

// ── the per-builder modifier bags ────────────────────────────────────────────
// A column type accepts only the modifiers its own builder has (see the pg
// stub for why this is worth pinning).

// @ts-expect-error autoincrement() is the integer kinds only
type _noAutoincrementOnVarchar = Varchar<'v', {autoincrement: true}>;
// @ts-expect-error defaultNow() and onUpdateNow() are timestamp only
type _noDefaultNowOnText = Text<'t', {defaultNow: true}>;
// @ts-expect-error mysql columns have no array() — that is a pg modifier
type _noArrayOnText = Text<'t', {array: true}>;
export type _BagPins = [_noAutoincrementOnVarchar, _noDefaultNowOnText, _noArrayOnText];
