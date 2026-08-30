/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the slim sqlite surface (checked by tsc, not
// executed): mode-dependent column types equal the builders' inferred data,
// the auto-increment primary key gains a default (optional insert), and the
// twin table (builders vs pure type) yields byte-identical models. The full
// model rule matrix is pinned in the pg package; the shared machinery lives
// in @mionjs/drizzle-orm.

import type {BigInt as RTBigInt, Date as RTDate, Float, Integer as IntegerFormat, String as Str} from '@ts-runtypes/core/formats';
import type {ColDataOf, InferInsertModel, InferSelectModel, InferSelectViewModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import type {Blob, Int, Integer, Numeric, Real, SqliteTable, Text} from './index.ts';
import {blob, int, integer, numeric, real, sqliteTable, sqliteView, text} from './index.ts';

/** Data a column type carries (the builder-equivalence probe: a column type IS
 *  the branded column now, so this reads the same brand off both roads). */
type TypeRoadData<C> = ColDataOf<C>;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ── named type === builder data ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const namedPins = {
  int: integer('i'),
  intAlias: int('ia'),
  intTimestamp: integer('i2', {mode: 'timestamp'}),
  intBoolean: integer('i3', {mode: 'boolean'}),
  blobBigint: blob('b', {mode: 'bigint'}),
  blobBuffer: blob('b2'),
  numericNumber: numeric('n', {mode: 'number'}),
  numericString: numeric('n2'),
  text: text('t', {length: 50}),
  textEnum: text('t2', {enum: ['a', 'b']}),
  textJson: text('t3', {mode: 'json'}).$type<{x: number}>(),
};
type _int = Expect<Equal<ColDataOf<(typeof namedPins)['int']>, TypeRoadData<Integer<'i'>>>>;
// drizzle's `int` alias has its own column type, so a converted table prints it
// back as int() rather than integer().
type _intAlias = Expect<Equal<ColDataOf<(typeof namedPins)['intAlias']>, TypeRoadData<Int<'ia'>>>>;
type _intTimestamp = Expect<
  Equal<ColDataOf<(typeof namedPins)['intTimestamp']>, TypeRoadData<Integer<'i2', {mode: 'timestamp'}>>>
>;
type _intBoolean = Expect<Equal<ColDataOf<(typeof namedPins)['intBoolean']>, TypeRoadData<Integer<'i3', {mode: 'boolean'}>>>>;
type _blobBigint = Expect<Equal<ColDataOf<(typeof namedPins)['blobBigint']>, TypeRoadData<Blob<'b', {mode: 'bigint'}>>>>;
type _blobBuffer = Expect<Equal<ColDataOf<(typeof namedPins)['blobBuffer']>, TypeRoadData<Blob<'b2'>>>>;
type _numericNumber = Expect<Equal<ColDataOf<(typeof namedPins)['numericNumber']>, TypeRoadData<Numeric<'n', {mode: 'number'}>>>>;
type _numericString = Expect<Equal<ColDataOf<(typeof namedPins)['numericString']>, TypeRoadData<Numeric<'n2'>>>>;
type _text = Expect<Equal<ColDataOf<(typeof namedPins)['text']>, TypeRoadData<Text<'t', {length: 50}>>>>;
type _textEnum = Expect<Equal<ColDataOf<(typeof namedPins)['textEnum']>, TypeRoadData<Text<'t2', {enum: ['a', 'b']}>>>>;
type _textJson = Expect<
  Equal<ColDataOf<(typeof namedPins)['textJson']>, TypeRoadData<Text<'t3', {mode: 'json'; $type: [{x: number}]}>>>
>;
// The column vocabulary also stands alone: the data a column type carries is
// exactly the core format the builder of the same call infers.
type _intIsInteger = Expect<Equal<TypeRoadData<Integer<'i'>>, IntegerFormat>>;
type _intNamed = Expect<Equal<TypeRoadData<Integer<{mode: 'timestamp'}>>, RTDate>>;
type _intBooleanNamed = Expect<Equal<TypeRoadData<Integer<{mode: 'boolean'}>>, boolean>>;
type _blobNamed = Expect<Equal<TypeRoadData<Blob<{mode: 'bigint'}>>, RTBigInt>>;
type _blobBufferNamed = Expect<Equal<TypeRoadData<Blob>, Buffer>>;
type _numericNamed = Expect<Equal<TypeRoadData<Numeric<{mode: 'number'}>>, Float>>;
type _numericStringNamed = Expect<Equal<TypeRoadData<Numeric>, string>>;
type _textNamed = Expect<Equal<TypeRoadData<Text<{length: 50}>>, Str<{maxLength: 50}>>>;
type _textEnumNamed = Expect<Equal<TypeRoadData<Text<{enum: ['a', 'b']}>>, 'a' | 'b'>>;

// ── model rules ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const users = sqliteTable('users', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
});
type User = InferSelectModel<typeof users>;
type NewUser = InferInsertModel<typeof users>;
type _pkSelect = Expect<Equal<User['id'], IntegerFormat>>;
type _pkAutoIncrementOptional = Expect<Equal<NewUser['id'], IntegerFormat | undefined>>;

// ── type road ↔ builder road ─────────────────────────────────────────────────

// The same table written both ways yields byte-identical models, the
// autoIncrement primary key config included (both roads mark the insert id
// optional through hasDefault).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const twinBuilders = sqliteTable('twins', {
  id: integer('id').primaryKey({autoIncrement: true}),
  title: text('title', {length: 80}).notNull(),
  rating: real('rating').notNull().default(4.5),
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
});
type TwinType = SqliteTable<
  'twins',
  {
    id: Integer<'id', {primaryKey: [{autoIncrement: true}]}>;
    title: Text<'title', {length: 80; notNull: true}>;
    rating: Real<'rating', {notNull: true; default: [4.5]}>;
    createdAt: Integer<'created_at', {mode: 'timestamp'; notNull: true}>;
  }
>;
type _twinSelect = Expect<Equal<InferSelectModel<typeof twinBuilders>, InferSelectModel<TwinType>>>;
type _twinInsert = Expect<Equal<InferInsertModel<typeof twinBuilders>, InferInsertModel<TwinType>>>;
type _twinUpdate = Expect<Equal<InferUpdateModel<typeof twinBuilders>, InferUpdateModel<TwinType>>>;
type _twinPkOptional = Expect<Equal<InferInsertModel<TwinType>['id'], IntegerFormat | undefined>>;
// A plain PrimaryKey is ALSO optional on insert: sqlite's `integer primary key`
// is the rowid, so drizzle gives it a database default with or without
// autoIncrement (its builder is the only one declaring primaryKeyHasDefault).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const plainPkBuilders = sqliteTable('plain_pk', {id: integer('id').primaryKey()});
type PlainPkType = SqliteTable<'plain_pk', {id: Integer<'id', {primaryKey: true}>}>;
type _plainPkInsert = Expect<Equal<InferInsertModel<typeof plainPkBuilders>, InferInsertModel<PlainPkType>>>;
type _plainPkOptional = Expect<Equal<InferInsertModel<PlainPkType>['id'], IntegerFormat | undefined>>;
// A TEXT primary key has no default, so that one really does stay required.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const textPkBuilders = sqliteTable('text_pk', {id: text('id').primaryKey()});
type TextPkType = SqliteTable<'text_pk', {id: Text<'id', {primaryKey: true}>}>;
type _textPkInsert = Expect<Equal<InferInsertModel<typeof textPkBuilders>, InferInsertModel<TextPkType>>>;
type _textPkRequired = Expect<Equal<InferInsertModel<TextPkType>['id'], Str>>;

// ── views: select-only models ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const pinnedView = sqliteView('pinned_view', {
  name: text('name').notNull(),
  note: text('note'),
}).existing();
type PinnedRow = InferSelectViewModel<typeof pinnedView>;
type _viewSelectNotNull = Expect<Equal<PinnedRow['name'], Str>>;
type _viewSelectNullable = Expect<Equal<PinnedRow['note'], Str | null>>;
// A view is READ-ONLY and is not a table: the three table models all reject it.
// @ts-expect-error InferSelectModel takes a table, a view uses InferSelectViewModel
type _viewNotSelectModel = InferSelectModel<typeof pinnedView>;
// @ts-expect-error a view has no insert model
type _viewNotInsertModel = InferInsertModel<typeof pinnedView>;
// @ts-expect-error a view has no update model
type _viewNotUpdateModel = InferUpdateModel<typeof pinnedView>;

export type _SqliteTypePins = [
  _int,
  _intAlias,
  _intTimestamp,
  _intBoolean,
  _blobBigint,
  _blobBuffer,
  _numericNumber,
  _numericString,
  _text,
  _textEnum,
  _textJson,
  _intIsInteger,
  _intNamed,
  _intBooleanNamed,
  _blobNamed,
  _blobBufferNamed,
  _numericNamed,
  _numericStringNamed,
  _textNamed,
  _textEnumNamed,
  _pkSelect,
  _pkAutoIncrementOptional,
  _twinSelect,
  _twinInsert,
  _twinUpdate,
  _twinPkOptional,
  _plainPkInsert,
  _plainPkOptional,
  _textPkInsert,
  _textPkRequired,
  _viewSelectNotNull,
  _viewSelectNullable,
  _viewNotSelectModel,
  _viewNotInsertModel,
  _viewNotUpdateModel,
];

// ── the modifier bag ─────────────────────────────────────────────────────────
// A column type accepts only the modifiers sqlite builders have (see the pg
// stub for why this is worth pinning).

// @ts-expect-error autoincrement() is a mysql modifier; sqlite spells it
// through the primaryKey config, {primaryKey: [{autoIncrement: true}]}
type _noAutoincrementOnText = Text<'t', {autoincrement: true}>;
// @ts-expect-error defaultNow() is a pg / mysql modifier
type _noDefaultNowOnText = Text<'t', {defaultNow: true}>;
// @ts-expect-error sqlite columns have no array()
type _noArrayOnInteger = Integer<'i', {array: true}>;
export type _BagPins = [_noAutoincrementOnText, _noDefaultNowOnText, _noArrayOnInteger];
