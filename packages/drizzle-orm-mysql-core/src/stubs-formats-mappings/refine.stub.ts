/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-level pins for refineTableType + the Infer* utilities: refinement params
// MERGE into the captured format params (refinement wins on a shared key),
// untouched columns keep their exact shape (nullability included), insert
// optionality survives the surgery, and every illegal refinement (wrong
// family, unknown param, unknown column, passthrough column, nullability) is
// a compile error. Never executed - compiled by tsconfig.stubs.json via
// type-inference.spec.ts.

import {mysqlTable, boolean} from 'drizzle-orm/mysql-core';
import {int, text, timestamp, varchar} from '../index.ts';
import type {InferInsert, InferSelect, InferUpdate} from '../index.ts';
import {refineTableType} from '../index.ts';
import type {Date as RTDate, Number as RTNumber, String as Str} from '@ts-runtypes/core/formats';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const users = mysqlTable('users', {
  name: varchar('name', {length: 100}).notNull(),
  age: int('age').notNull(),
  bio: text('bio'),
  active: boolean('active').notNull(),
  createdAt: timestamp('created_at', {mode: 'date'}).notNull().defaultNow(),
});

const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
type ApiUser = InferSelect<typeof apiUsers>;
type ApiUserInsert = InferInsert<typeof apiUsers>;
type ApiUserPatch = InferUpdate<typeof apiUsers>;

// Refined columns merge params: the refinement is added and the captured
// param kept; on a SHARED key the refinement wins (int() stamps Int32,
// its captured min is replaced by the refined one).
type _nameMerges = Assert<Equal<ApiUser['name'], Str<{maxLength: 100; minLength: 10}>>>;
type _ageMerges = Assert<Equal<ApiUser['age'], RTNumber<{integer: true; max: 2147483647; min: 18}>>>;
// Untouched columns keep their exact former shape, nullability included.
type _bioUntouched = Assert<Equal<ApiUser['bio'], Str | null>>;
type _createdAtUntouched = Assert<Equal<ApiUser['createdAt'], RTDate>>;
// Insert optionality survives the surgery (defaultNow stays optional, refined
// required columns stay required).
type _insertKeepsDefaultOptional = Assert<Equal<ApiUserInsert['createdAt'], RTDate | undefined>>;
type _insertKeepsRequired = Assert<Equal<ApiUserInsert['name'], Str<{maxLength: 100; minLength: 10}>>>;
// The update model is any subset of the insert payload, formats kept.
type _patchIsPartial = Assert<Equal<ApiUserPatch['name'], Str<{maxLength: 100; minLength: 10}> | undefined>>;

// The unrefined table is unchanged (refineTableType never mutates the input type).
type _sourceUnchanged = Assert<Equal<InferSelect<typeof users>['name'], Str<{maxLength: 100}>>>;

// Rejections: wrong family param, unknown param, unknown column, and any
// refinement on a passthrough (format-less) column are compile errors.
// @ts-expect-error min is a number-family param, name is a string column
refineTableType(users, {name: {min: 3}});
// @ts-expect-error unknown param key for the string family
refineTableType(users, {name: {minLen: 3}});
// @ts-expect-error unknown column
refineTableType(users, {nope: {minLength: 3}});
// @ts-expect-error boolean is passthrough (no format family), not refinable
refineTableType(users, {active: {min: 1}});
// @ts-expect-error nullability is SQL truth, not a refinement param
refineTableType(users, {bio: {notNull: true}});

export type _RefinePins = [
  _nameMerges,
  _ageMerges,
  _bioUntouched,
  _createdAtUntouched,
  _insertKeepsDefaultOptional,
  _insertKeepsRequired,
  _patchIsPartial,
  _sourceUnchanged,
];

// the refined table is consumed via typeof only; reference it so lint sees a value use
void apiUsers;
