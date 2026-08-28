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
import type {
  ColDataOf,
  InferInsertModel,
  InferSelectModel,
  InferUpdateModel,
  NormalizeCol,
  RefinedTable,
} from '@mionjs/drizzle-orm';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {
  Bigint,
  Boolean as PgBoolean,
  DefaultRandom,
  Integer,
  Json,
  NotNull,
  PgDate,
  PgTable,
  PrimaryKey,
  Serial,
  Text,
  Timestamp,
  Uuid,
  Varchar,
} from './index.ts';
import {bigint, boolean, date, integer, json, jsonb, pgEnum, pgTable, serial, text, timestamp, uuid, varchar} from './index.ts';

/** Data a column type carries once normalized (the builder-equivalence probe). */
type TypeRoadData<C> = ColDataOf<NormalizeCol<C>>;

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
type _namedSerial = Expect<Equal<ColDataOf<(typeof namedPins)['serial']>, Serial>>;
type _namedUuid = Expect<Equal<ColDataOf<(typeof namedPins)['uuid']>, TypeRoadData<Uuid<'u'>>>>;
type _namedTimestamp = Expect<Equal<ColDataOf<(typeof namedPins)['timestampDate']>, Timestamp>>;
type _namedTimestampString = Expect<Equal<ColDataOf<(typeof namedPins)['timestampString']>, Timestamp<'string'>>>;
type _namedDate = Expect<Equal<ColDataOf<(typeof namedPins)['dateString']>, PgDate>>;
type _namedDateDate = Expect<Equal<ColDataOf<(typeof namedPins)['dateDate']>, PgDate<'date'>>>;
type _namedBigintNumber = Expect<Equal<ColDataOf<(typeof namedPins)['bigintNumber']>, Bigint>>;
type _namedBigintBig = Expect<Equal<ColDataOf<(typeof namedPins)['bigintBig']>, Bigint<'bigint'>>>;
type _namedBoolean = Expect<Equal<ColDataOf<(typeof namedPins)['boolean']>, PgBoolean>>;
type _namedJson = Expect<Equal<ColDataOf<(typeof namedPins)['json']>, Json>>;
type _namedText = Expect<Equal<ColDataOf<(typeof namedPins)['text']>, Text>>;
// The column vocabulary also stands alone: the data a column type carries is
// exactly the core format the builder of the same call infers.
type _timestampIsDate = Expect<Equal<Timestamp, RTDate>>;
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

type _selectSerial = Expect<Equal<User['id'], Serial>>;
type _selectNullable = Expect<Equal<User['bio'], Text | null>>;
type _selectEnum = Expect<Equal<User['role'], 'admin' | 'user'>>;
type _selectTextEnum = Expect<Equal<User['plan'], 'free' | 'pro' | null>>;
type _selectType = Expect<Equal<User['meta'], {tags: string[]}>>;
type _selectIdentityAlways = Expect<Equal<User['seq'], Int32>>;
// insert: serial + defaulted optional; identity-always excluded; nullable
// optional with null; required stays required.
type _insertSerialOptional = Expect<Equal<NewUser['id'], Serial | undefined>>;
type _insertDefaultedOptional = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _insertRandomDefault = Expect<Equal<NewUser['publicId'], UUID | undefined>>;
type _insertByDefaultIdentity = Expect<Equal<NewUser['byDefaultSeq'], Int32 | undefined>>;
type _insertExcluded = Expect<Equal<'seq' extends keyof NewUser ? true : false, false>>;
type _insertNullable = Expect<Equal<NewUser['bio'], Text | null | undefined>>;
type _insertRequired = Expect<Equal<NewUser['name'], RTString<{maxLength: 100}>>>;
// update: any subset of the insert payload, identity-always still excluded.
type _patchPartial = Expect<Equal<UserPatch['name'], RTString<{maxLength: 100}> | undefined>>;
type _patchExcluded = Expect<Equal<'seq' extends keyof UserPatch ? true : false, false>>;

// ── type road ↔ builder road ─────────────────────────────────────────────────

// The same table written both ways yields byte-identical models. This is the
// core interchangeability promise of the pure-types road.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const twinBuilders = pgTable('twins', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
  bio: varchar('bio', {length: 500}),
});
type TwinType = PgTable<
  'twins',
  {
    id: Uuid<'id'> & PrimaryKey & DefaultRandom;
    name: Varchar<'name', {length: 100}> & NotNull;
    age: Integer<'age'> & NotNull;
    bio: Varchar<'bio', {length: 500}>;
  }
>;
type _twinSelect = Expect<Equal<InferSelectModel<typeof twinBuilders>, InferSelectModel<TwinType>>>;
type _twinInsert = Expect<Equal<InferInsertModel<typeof twinBuilders>, InferInsertModel<TwinType>>>;
type _twinUpdate = Expect<Equal<InferUpdateModel<typeof twinBuilders>, InferUpdateModel<TwinType>>>;
// Refinement works on a type-road table through the RefinedTable type.
type RefinedTwin = RefinedTable<TwinType, {name: {minLength: 2}}>;
type _twinRefined = Expect<Equal<InferSelectModel<RefinedTwin>['name'], RTString<{maxLength: 100; minLength: 2}>>>;

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
];
