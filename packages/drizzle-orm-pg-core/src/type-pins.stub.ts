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

import type {Date as RTDate, Number as RTNumber, String as RTString} from '@ts-runtypes/core/formats';
import type {ColDataOf, InferInsertModel, InferSelectModel, InferUpdateModel} from '@mionjs/drizzle-orm';
import {refineTableType} from '@mionjs/drizzle-orm';
import type {Bigint, Boolean as PgBoolean, Integer, Json, PgDate, Serial, Text, Timestamp, Uuid, Varchar} from './index.ts';
import {bigint, boolean, date, integer, json, jsonb, pgEnum, pgTable, serial, text, timestamp, uuid, varchar} from './index.ts';

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
type _namedVarchar = Expect<Equal<ColDataOf<(typeof namedPins)['varchar']>, Varchar<100>>>;
type _namedVarcharBare = Expect<Equal<ColDataOf<(typeof namedPins)['varcharBare']>, Varchar>>;
type _namedInteger = Expect<Equal<ColDataOf<(typeof namedPins)['integer']>, Integer>>;
type _namedSerial = Expect<Equal<ColDataOf<(typeof namedPins)['serial']>, Serial>>;
type _namedUuid = Expect<Equal<ColDataOf<(typeof namedPins)['uuid']>, Uuid>>;
type _namedTimestamp = Expect<Equal<ColDataOf<(typeof namedPins)['timestampDate']>, Timestamp>>;
type _namedTimestampString = Expect<Equal<ColDataOf<(typeof namedPins)['timestampString']>, Timestamp<'string'>>>;
type _namedDate = Expect<Equal<ColDataOf<(typeof namedPins)['dateString']>, PgDate>>;
type _namedDateDate = Expect<Equal<ColDataOf<(typeof namedPins)['dateDate']>, PgDate<'date'>>>;
type _namedBigintNumber = Expect<Equal<ColDataOf<(typeof namedPins)['bigintNumber']>, Bigint>>;
type _namedBigintBig = Expect<Equal<ColDataOf<(typeof namedPins)['bigintBig']>, Bigint<'bigint'>>>;
type _namedBoolean = Expect<Equal<ColDataOf<(typeof namedPins)['boolean']>, PgBoolean>>;
type _namedJson = Expect<Equal<ColDataOf<(typeof namedPins)['json']>, Json>>;
type _namedText = Expect<Equal<ColDataOf<(typeof namedPins)['text']>, Text>>;
// The named vocabulary also stands alone: a hand-written row type carries the
// same formats the builders infer.
type _timestampIsDate = Expect<Equal<Timestamp, RTDate>>;
type _varcharIsString = Expect<Equal<Varchar<100>, RTString<{maxLength: 100}>>>;

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
type _selectIdentityAlways = Expect<Equal<User['seq'], Integer>>;
// insert: serial + defaulted optional; identity-always excluded; nullable
// optional with null; required stays required.
type _insertSerialOptional = Expect<Equal<NewUser['id'], Serial | undefined>>;
type _insertDefaultedOptional = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _insertRandomDefault = Expect<Equal<NewUser['publicId'], Uuid | undefined>>;
type _insertByDefaultIdentity = Expect<Equal<NewUser['byDefaultSeq'], Integer | undefined>>;
type _insertExcluded = Expect<Equal<'seq' extends keyof NewUser ? true : false, false>>;
type _insertNullable = Expect<Equal<NewUser['bio'], Text | null | undefined>>;
type _insertRequired = Expect<Equal<NewUser['name'], RTString<{maxLength: 100}>>>;
// update: any subset of the insert payload, identity-always still excluded.
type _patchPartial = Expect<Equal<UserPatch['name'], RTString<{maxLength: 100}> | undefined>>;
type _patchExcluded = Expect<Equal<'seq' extends keyof UserPatch ? true : false, false>>;

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
