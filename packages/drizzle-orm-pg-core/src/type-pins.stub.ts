/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the slim pg surface (checked by tsc, not executed):
// - every builder's inferred Data equals its NAMED type (the pure-types
//   vocabulary cannot drift from the builders);
// - the model rules: select nullability, insert optionality for defaults and
//   serials, generated/identity exclusion, patch partiality;
// - refinement merges params and rejects non-refinable columns;
// - enum tuples become literal unions and $type overrides win.

import type {Date as RTDate, Int32, Number as RTNumber, String as RTString, UUID} from '@ts-runtypes/core/formats';
import type {ColDataOf, InferInsertModel, InferSelectModel, InferUpdateModel, RefinedTable} from '@mionjs/drizzle-orm';
import {refineTableType, sql} from '@mionjs/drizzle-orm';
import type {InferSelectViewModel} from '@mionjs/drizzle-orm';
import type {PgDatabase, PgQueryResultHKT} from 'drizzle-orm/pg-core';
import {toDrizzle} from './drizzle.ts';
import type {
  Bigint,
  Boolean as PgBoolean,
  Integer,
  Json,
  Jsonb,
  PgDate,
  PgTable,
  Serial,
  Text,
  Timestamp,
  Uuid,
  Varchar,
} from './index.ts';
import {
  bigint,
  boolean,
  date,
  integer,
  json,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from './index.ts';

/** Data a column type carries (the builder-equivalence probe: a column type IS
 *  the branded column now, so this reads the same brand off both roads). */
type TypeRoadData<C> = ColDataOf<C>;

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ── named type === builder data ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const namedPins = {
  varchar: varchar('v', {length: 100}),
  varcharBare: varchar('v2'),
  integer: integer('i'),
  serial: serial('s'),
  uuid: uuid('u'),
  timestampDate: timestamp('t'),
  timestampString: timestamp('t2', {mode: 'string'}),
  dateString: date('d'),
  dateDate: date('d2', {mode: 'date'}),
  bigintNumber: bigint('b', {mode: 'number'}),
  bigintBig: bigint('b2', {mode: 'bigint'}),
  boolean: boolean('bo'),
  json: json('j'),
  text: text('tx'),
};
type _namedVarchar = Expect<Equal<ColDataOf<(typeof namedPins)['varchar']>, TypeRoadData<Varchar<'v', {length: 100}>>>>;
type _namedVarcharBare = Expect<Equal<ColDataOf<(typeof namedPins)['varcharBare']>, TypeRoadData<Varchar<'v2'>>>>;
type _namedInteger = Expect<Equal<ColDataOf<(typeof namedPins)['integer']>, TypeRoadData<Integer<'i'>>>>;
type _namedSerial = Expect<Equal<ColDataOf<(typeof namedPins)['serial']>, TypeRoadData<Serial<'s'>>>>;
type _namedUuid = Expect<Equal<ColDataOf<(typeof namedPins)['uuid']>, TypeRoadData<Uuid<'u'>>>>;
type _namedTimestamp = Expect<Equal<ColDataOf<(typeof namedPins)['timestampDate']>, TypeRoadData<Timestamp<'t'>>>>;
type _namedTimestampString = Expect<
  Equal<ColDataOf<(typeof namedPins)['timestampString']>, TypeRoadData<Timestamp<'t2', {mode: 'string'}>>>
>;
type _namedDate = Expect<Equal<ColDataOf<(typeof namedPins)['dateString']>, TypeRoadData<PgDate<'d'>>>>;
type _namedDateDate = Expect<Equal<ColDataOf<(typeof namedPins)['dateDate']>, TypeRoadData<PgDate<'d2', {mode: 'date'}>>>>;
type _namedBigintNumber = Expect<
  Equal<ColDataOf<(typeof namedPins)['bigintNumber']>, TypeRoadData<Bigint<'b', {mode: 'number'}>>>
>;
type _namedBigintBig = Expect<Equal<ColDataOf<(typeof namedPins)['bigintBig']>, TypeRoadData<Bigint<'b2', {mode: 'bigint'}>>>>;
type _namedBoolean = Expect<Equal<ColDataOf<(typeof namedPins)['boolean']>, TypeRoadData<PgBoolean<'bo'>>>>;
type _namedJson = Expect<Equal<ColDataOf<(typeof namedPins)['json']>, TypeRoadData<Json<'j'>>>>;
type _namedText = Expect<Equal<ColDataOf<(typeof namedPins)['text']>, TypeRoadData<Text<'tx'>>>>;
// The column vocabulary also stands alone: the data a column type carries is
// exactly the core format the builder of the same call infers.
type _timestampIsDate = Expect<Equal<TypeRoadData<Timestamp<'t'>>, RTDate>>;
type _varcharIsString = Expect<Equal<TypeRoadData<Varchar<'v', {length: 100}>>, RTString<{maxLength: 100}>>>;
type _uuidIsUUID = Expect<Equal<TypeRoadData<Uuid<'u'>>, UUID>>;
type _integerIsInt32 = Expect<Equal<TypeRoadData<Integer<'i'>>, Int32>>;
type _varcharEnum = Expect<Equal<TypeRoadData<Varchar<'v', {enum: ['a', 'b']}>>, 'a' | 'b'>>;
type _varcharConfigOnly = Expect<Equal<TypeRoadData<Varchar<{length: 5}>>, RTString<{maxLength: 5}>>>;

// ── model rules ──────────────────────────────────────────────────────────────

const roleEnum = pgEnum('role', ['admin', 'user']);
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  publicId: uuid('public_id').defaultRandom().notNull(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  role: roleEnum('role').notNull(),
  plan: text('plan', {enum: ['free', 'pro']}),
  seq: integer('seq').generatedAlwaysAsIdentity(),
  byDefaultSeq: integer('bd_seq').generatedByDefaultAsIdentity(),
  bio: text('bio'),
  meta: jsonb('meta').$type<{tags: string[]}>().notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
type User = InferSelectModel<typeof users>;
type NewUser = InferInsertModel<typeof users>;
type UserPatch = InferUpdateModel<typeof users>;

type _selectSerial = Expect<Equal<User['id'], Int32>>;
type _selectNullable = Expect<Equal<User['bio'], RTString | null>>;
type _selectEnum = Expect<Equal<User['role'], 'admin' | 'user'>>;
type _selectTextEnum = Expect<Equal<User['plan'], 'free' | 'pro' | null>>;
type _selectType = Expect<Equal<User['meta'], {tags: string[]}>>;
type _selectIdentityAlways = Expect<Equal<User['seq'], Int32>>;
// insert: serial + defaulted optional; identity-always excluded; nullable
// optional with null; required stays required.
type _insertSerialOptional = Expect<Equal<NewUser['id'], Int32 | undefined>>;
type _insertDefaultedOptional = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _insertRandomDefault = Expect<Equal<NewUser['publicId'], UUID | undefined>>;
type _insertByDefaultIdentity = Expect<Equal<NewUser['byDefaultSeq'], Int32 | undefined>>;
type _insertExcluded = Expect<Equal<'seq' extends keyof NewUser ? true : false, false>>;
type _insertNullable = Expect<Equal<NewUser['bio'], RTString | null | undefined>>;
type _insertRequired = Expect<Equal<NewUser['name'], RTString<{maxLength: 100}>>>;
// update: any subset of the insert payload, identity-always still excluded.
type _patchPartial = Expect<Equal<UserPatch['name'], RTString<{maxLength: 100}> | undefined>>;
type _patchExcluded = Expect<Equal<'seq' extends keyof UserPatch ? true : false, false>>;

// ── type road ↔ builder road ─────────────────────────────────────────────────

// The same table written both ways yields byte-identical models. This is the
// core interchangeability promise of the pure-types road.
const twinBuilders = pgTable('twins', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  bio: varchar('bio', {length: 500}),
});
type TwinType = PgTable<
  'twins',
  {
    id: Uuid<'id', {primaryKey: true; defaultRandom: true}>;
    name: Varchar<'name', {length: 100; notNull: true}>;
    age: Integer<'age', {notNull: true}>;
    bio: Varchar<'bio', {length: 500}>;
  }
>;
// The widened vocabulary: serial base flags, enums, unique, identity, array,
// $type, defaultNow — same both-roads equality bar.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const twinWideBuilders = pgTable('twins_wide', {
  id: serial('id').primaryKey(),
  role: text('role', {enum: ['free', 'pro']}).notNull(),
  seq: integer('seq').generatedAlwaysAsIdentity(),
  bySeq: integer('by_seq').generatedByDefaultAsIdentity({name: 'sq', startWith: 5}),
  tags: text('tags').array().notNull(),
  meta: jsonb('meta').$type<{tags: string[]}>().notNull(),
  score: integer('score').unique('uq_score'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
type TwinWideType = PgTable<
  'twins_wide',
  {
    id: Serial<'id', {primaryKey: true}>;
    role: Text<'role', {enum: ['free', 'pro']; notNull: true}>;
    seq: Integer<'seq', {generatedAlwaysAsIdentity: true}>;
    bySeq: Integer<'by_seq', {generatedByDefaultAsIdentity: [{name: 'sq'; startWith: 5}]}>;
    tags: Text<'tags', {array: true; notNull: true}>;
    meta: Jsonb<'meta', {$type: [{tags: string[]}]; notNull: true}>;
    score: Integer<'score', {unique: ['uq_score']}>;
    createdAt: Timestamp<'created_at', {notNull: true; defaultNow: true}>;
  }
>;
type _twinWideSelect = Expect<Equal<InferSelectModel<typeof twinWideBuilders>, InferSelectModel<TwinWideType>>>;
type _twinWideInsert = Expect<Equal<InferInsertModel<typeof twinWideBuilders>, InferInsertModel<TwinWideType>>>;
type _twinWideUpdate = Expect<Equal<InferUpdateModel<typeof twinWideBuilders>, InferUpdateModel<TwinWideType>>>;

type _twinSelect = Expect<Equal<InferSelectModel<typeof twinBuilders>, InferSelectModel<TwinType>>>;
type _twinInsert = Expect<Equal<InferInsertModel<typeof twinBuilders>, InferInsertModel<TwinType>>>;
type _twinUpdate = Expect<Equal<InferUpdateModel<typeof twinBuilders>, InferUpdateModel<TwinType>>>;
// One public name describes both roads: the factories declare PgTable as their
// return, and a builder table is assignable to the type-road spelling.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the assignment IS the pin
const _twinAsPgTable: TwinType = twinBuilders;
// Refinement works on a type-road table through the RefinedTable type.
type RefinedTwin = RefinedTable<TwinType, {name: {minLength: 2}}>;
type _twinRefined = Expect<Equal<InferSelectModel<RefinedTwin>['name'], RTString<{maxLength: 100; minLength: 2}>>>;
// The R parameter is constrained to TableRefinements<T>: a typo'd column or a
// wrong-family param is a compile error at the TYPE level too.
// @ts-expect-error "nam" is not a column of TwinType
type _refinedBadKey = RefinedTable<TwinType, {nam: {minLength: 2}}>;
// @ts-expect-error a string column takes no numeric refinement
type _refinedBadParam = RefinedTable<TwinType, {name: {min: 2}}>;

// ── refinement ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
type ApiUser = InferSelectModel<typeof apiUsers>;
type _refinedName = Expect<Equal<ApiUser['name'], RTString<{maxLength: 100; minLength: 10}>>>;
type _refinedAge = Expect<Equal<ApiUser['age'], RTNumber<{integer: true; min: 18; max: 2147483647}>>>;
type _refineKeepsOthers = Expect<Equal<ApiUser['createdAt'], RTDate>>;

// Non-refinable columns reject ANY refinement (never a silent bypass).
// @ts-expect-error a boolean column carries no refinable format
refineTableType(pgTable('flags', {on: boolean('on')}), {on: {min: 1}});
// @ts-expect-error an enum column carries no refinable format
refineTableType(users, {role: {maxLength: 3}});
// @ts-expect-error refining cannot change the value family
refineTableType(users, {name: {min: 3}});

// ── views: select-only models ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const pinnedView = pgView('pinned_view', {
  id: uuid('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  city: text('city'),
}).as(sql`select 1`);
type PinnedRow = InferSelectViewModel<typeof pinnedView>;
type _viewSelectNotNull = Expect<Equal<PinnedRow['name'], RTString<{maxLength: 100}>>>;
type _viewSelectNullable = Expect<Equal<PinnedRow['city'], RTString | null>>;
type _viewSelectPk = Expect<Equal<PinnedRow['id'], UUID>>;
// A view is READ-ONLY and is not a table: the three table models all reject it.
// @ts-expect-error InferSelectModel takes a table, a view uses InferSelectViewModel
type _viewNotSelectModel = InferSelectModel<typeof pinnedView>;
// @ts-expect-error a view has no insert model
type _viewNotInsertModel = InferInsertModel<typeof pinnedView>;
// @ts-expect-error a view has no update model
type _viewNotUpdateModel = InferUpdateModel<typeof pinnedView>;

export // ── The slim <-> drizzle boundary ────────────────────────────────────────────
//
// The one property that has to hold in BOTH directions, because it is what
// makes a slim table usable from a mion route: a row a drizzle query returns
// goes into a slim model slot, and a slim model goes into a drizzle query.
//
// toDrizzle drops a column's runtype FORMAT tag, so `db.select()` gives exactly
// what drizzle's own table gives. That costs nothing here: a format tag is
// transparent (its sentinels are optional, so the tagged type and its base are
// mutually assignable). A NOMINAL brand is not transparent and is kept, which is
// what the last two pins are for — without them a queried id could not go back
// into the model it came from.

const boundaryUsers = pgTable('boundary_users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});
const boundaryApi = refineTableType(boundaryUsers, {name: {minLength: 10}, age: {min: 18}});
type BoundaryUser = InferSelectModel<typeof boundaryApi>;
type NewBoundaryUser = InferInsertModel<typeof boundaryApi>;
type BoundaryPatch = InferUpdateModel<typeof boundaryApi>;

declare const db: PgDatabase<PgQueryResultHKT>;
const dzBoundary = toDrizzle(boundaryApi);
const boundaryQuery = db.select().from(dzBoundary);
type BoundaryRows = Awaited<typeof boundaryQuery>;
declare const boundaryRows: BoundaryRows;

// a drizzle row IS what drizzle would return, and still fits the slim model
type _dbRowIsPlain = Expect<Equal<BoundaryRows[number]['name'], string>>;
type _dbDateIsPlain = Expect<Equal<BoundaryRows[number]['createdAt'], Date>>;
const _rowIntoModel: BoundaryUser = boundaryRows[0]!;
const _rowsIntoModel: BoundaryUser[] = boundaryRows;

// and a slim model still goes into a drizzle query
declare const newBoundary: NewBoundaryUser;
declare const boundaryPatch: BoundaryPatch;
const _insertFromModel = db.insert(dzBoundary).values(newBoundary);
const _insertManyFromModel = db.insert(dzBoundary).values([newBoundary, newBoundary]);
const _updateFromModel = db.update(dzBoundary).set(boundaryPatch);

// a NOMINAL brand survives, or a queried id could not go back into its model
type BoundaryId = RTString<{minLength: 1}, 'BoundaryId'>;
const brandedTable = pgTable('boundary_branded', {
  id: varchar('id', {length: 40}).notNull().$type<BoundaryId>(),
});
type BrandedRow = InferSelectModel<typeof brandedTable>;
const brandedQuery = db.select().from(toDrizzle(brandedTable));
type BrandedRows = Awaited<typeof brandedQuery>;
declare const brandedRows: BrandedRows;
const _brandedRowIntoModel: BrandedRow = brandedRows[0]!;
type _brandedIdKeepsBrand = Expect<Equal<BrandedRow['id'], BoundaryId>>;

export const _boundaryPins = [
  boundaryQuery,
  brandedQuery,
  _rowIntoModel,
  _rowsIntoModel,
  _insertFromModel,
  _insertManyFromModel,
  _updateFromModel,
  _brandedRowIntoModel,
];

export type _PgTypePins = [
  _namedVarchar,
  _namedVarcharBare,
  _namedInteger,
  _namedSerial,
  _namedUuid,
  _namedTimestamp,
  _namedTimestampString,
  _namedDate,
  _namedDateDate,
  _namedBigintNumber,
  _namedBigintBig,
  _namedBoolean,
  _namedJson,
  _namedText,
  _timestampIsDate,
  _varcharIsString,
  _uuidIsUUID,
  _integerIsInt32,
  _varcharEnum,
  _varcharConfigOnly,
  _twinSelect,
  _twinInsert,
  _twinUpdate,
  _twinWideSelect,
  _twinWideInsert,
  _twinWideUpdate,
  _twinRefined,
  _selectSerial,
  _selectNullable,
  _selectEnum,
  _selectTextEnum,
  _selectType,
  _selectIdentityAlways,
  _insertSerialOptional,
  _insertDefaultedOptional,
  _insertRandomDefault,
  _insertByDefaultIdentity,
  _insertExcluded,
  _insertNullable,
  _insertRequired,
  _patchPartial,
  _patchExcluded,
  _refinedName,
  _refinedAge,
  _refineKeepsOthers,
  _refinedBadKey,
  _refinedBadParam,
  _viewSelectNotNull,
  _viewSelectNullable,
  _viewSelectPk,
  _viewNotSelectModel,
  _viewNotInsertModel,
  _viewNotUpdateModel,
  _dbRowIsPlain,
  _dbDateIsPlain,
  _brandedIdKeepsBrand,
];

// ── the per-builder modifier bags ────────────────────────────────────────────
// A column type accepts only the modifiers its own builder has. This is new
// with modifiers-as-props: while they were separate marker interfaces, an
// intersection accepted any of them on any column, so `Varchar<...> &
// Autoincrement` compiled on pg even though no pg builder has autoincrement().

// @ts-expect-error pg varchar has no autoincrement() — that is a mysql modifier
type _noAutoincrementOnVarchar = Varchar<'v', {autoincrement: true}>;
// @ts-expect-error defaultNow() is date / time / timestamp only
type _noDefaultNowOnVarchar = Varchar<'v', {defaultNow: true}>;
// @ts-expect-error defaultRandom() is uuid only
type _noDefaultRandomOnInteger = Integer<'i', {defaultRandom: true}>;
// @ts-expect-error the identity modifiers are smallint / integer / bigint only
type _noIdentityOnText = Text<'t', {generatedAlwaysAsIdentity: true}>;
export type _BagPins = [_noAutoincrementOnVarchar, _noDefaultNowOnVarchar, _noDefaultRandomOnInteger, _noIdentityOnText];
