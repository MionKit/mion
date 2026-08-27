/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-level pins for the @mionjs/drizzle/pg proxy builders: a table declared
// with the wrappers yields an InferSelectModel carrying runtype formats (not
// plain primitives), chainables survive the stamp, enum configs keep
// drizzle's literal unions, and wrapper params stay assignable to drizzle's
// own. Never executed - compiled by tsconfig.stubs.json via
// type-inference.spec.ts.

import type {InferSelectModel} from 'drizzle-orm';
import {pgTable} from 'drizzle-orm/pg-core';
import {
  bigint,
  char,
  date,
  integer,
  numeric,
  serial,
  smallint,
  text,
  time,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb,
} from '../proxies/pg.ts';
import {varchar as drizzleVarchar, integer as drizzleInteger, timestamp as drizzleTimestamp} from 'drizzle-orm/pg-core';
import type {InsertModel, SelectModel, UpdateModel} from '../proxies/pg.ts';
import type {
  BigInt64,
  Date as RTDate,
  Integer,
  Int16,
  Int32,
  String as Str,
  StringDate,
  StringDateTime,
  StringTime,
  UUID,
} from '@ts-runtypes/core/formats';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

// ============================================================================
// §1 InferSelectModel carries formats, params captured from literal configs
// ============================================================================

const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  code: char('code', {length: 3}).notNull(),
  age: integer('age').notNull(),
  balance: numeric('balance', {precision: 10, scale: 2, mode: 'number'}).notNull(),
  bigCount: bigint('big_count', {mode: 'bigint'}).notNull(),
  smallCount: bigint('small_count', {mode: 'number'}).notNull(),
  role: text('role', {enum: ['admin', 'user']}).notNull(),
  bio: text('bio'),
  birthday: date('birthday').notNull(),
  wakeUp: time('wake_up').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at', {mode: 'string'}).notNull(),
  settings: jsonb('settings').$type<{theme: string}>().notNull(),
  active: boolean('active').notNull(),
});

type UserRow = InferSelectModel<typeof users>;

type _idIsUUID = Assert<Equal<UserRow['id'], UUID>>;
type _nameCapturesLength = Assert<Equal<UserRow['name'], Str<{maxLength: 100}>>>;
type _codeCapturesExactLength = Assert<Equal<UserRow['code'], Str<{length: 3}>>>;
type _ageIsInt32 = Assert<Equal<UserRow['age'], Int32>>;
type _balanceIsFloat = Assert<Equal<UserRow['balance'], import('@ts-runtypes/core/formats').Float>>;
type _bigintModeBigint = Assert<Equal<UserRow['bigCount'], BigInt64>>;
type _bigintModeNumber = Assert<Equal<UserRow['smallCount'], Integer>>;
// enum rule: the literal union survives untouched, no string format on top
type _roleKeepsEnum = Assert<Equal<UserRow['role'], 'admin' | 'user'>>;
type _bioOptionalPlainText = Assert<Equal<UserRow['bio'], Str | null>>;
type _dateDefaultIsStringDate = Assert<Equal<UserRow['birthday'], StringDate>>;
type _timeIsStringTime = Assert<Equal<UserRow['wakeUp'], StringTime>>;
type _timestampDefaultIsNativeDate = Assert<Equal<UserRow['createdAt'], RTDate>>;
type _timestampStringMode = Assert<Equal<UserRow['updatedAt'], StringDateTime>>;
// the manual .$type escape hatch keeps working through the passthrough
type _jsonbDollarType = Assert<Equal<UserRow['settings'], {theme: string}>>;
type _booleanPassthrough = Assert<Equal<UserRow['active'], boolean>>;

// ============================================================================
// §2 wrapper params stay assignable to drizzle's own (overload fidelity)
// ============================================================================

type _varcharParamsCompatible = Assert<
  Parameters<typeof varchar<'n', string, [string, ...string[]], 10>> extends Parameters<
    typeof drizzleVarchar<'n', string, [string, ...string[]], 10>
  >
    ? true
    : false
>;
type _integerParamsCompatible = Assert<
  Parameters<typeof integer<'n'>> extends Parameters<typeof drizzleInteger<'n'>> ? true : false
>;
type _timestampParamsCompatible = Assert<
  Parameters<typeof timestamp<'n', 'string'>> extends Parameters<typeof drizzleTimestamp<'n', 'string'>> ? true : false
>;

// ============================================================================
// §3 chainables survive the stamp (builder is still drizzle's builder)
// ============================================================================

const chained = pgTable('chained', {
  id: serial('id').primaryKey(),
  ref: uuid('ref').references(() => users.id),
  short: smallint('short').notNull().default(1),
  tags: text('tags').array().notNull(),
  codes: varchar('codes', {length: 10}).array(),
});
type ChainedRow = InferSelectModel<typeof chained>;
type _serialPrimaryKey = Assert<Equal<ChainedRow['id'], Int32>>;
type _referencesSurvives = Assert<Equal<ChainedRow['ref'], UUID | null>>;
type _defaultSurvives = Assert<Equal<ChainedRow['short'], Int16>>;
// .array() keeps the element format (the Stamp's array override carries it)
type _arrayKeepsFormat = Assert<Equal<ChainedRow['tags'], Str[]>>;
type _arrayKeepsParams = Assert<Equal<ChainedRow['codes'], Str<{maxLength: 10}>[] | null>>;

// ============================================================================
// §4 model utilities ride the subpaths and compose with proxy tables
// ============================================================================

type UserSelect = SelectModel<UserRow>;
type _selectKeepsFormats = Assert<Equal<UserSelect['name'], Str<{maxLength: 100}>>>;
type _selectKeepsNullable = Assert<Equal<UserSelect['bio'], Str | null>>;
type NewUser = InsertModel<UserRow, 'id', 'createdAt'>;
type _insertGeneratedRemoved = Assert<Equal<'id' extends keyof NewUser ? true : false, false>>;
type _insertDefaultedOptional = Assert<Equal<NewUser['createdAt'], RTDate | undefined>>;
type _insertKeepsFormats = Assert<Equal<NewUser['name'], Str<{maxLength: 100}>>>;
type _updateAnySubset = Assert<Equal<UpdateModel<UserRow>['name'], Str<{maxLength: 100}> | undefined>>;

export type _ProxyPgPins = [
  _idIsUUID,
  _nameCapturesLength,
  _codeCapturesExactLength,
  _ageIsInt32,
  _balanceIsFloat,
  _bigintModeBigint,
  _bigintModeNumber,
  _roleKeepsEnum,
  _bioOptionalPlainText,
  _dateDefaultIsStringDate,
  _timeIsStringTime,
  _timestampDefaultIsNativeDate,
  _timestampStringMode,
  _jsonbDollarType,
  _booleanPassthrough,
  _varcharParamsCompatible,
  _integerParamsCompatible,
  _timestampParamsCompatible,
  _serialPrimaryKey,
  _referencesSurvives,
  _defaultSurvives,
  _arrayKeepsFormat,
  _arrayKeepsParams,
  _selectKeepsFormats,
  _selectKeepsNullable,
  _insertGeneratedRemoved,
  _insertDefaultedOptional,
  _insertKeepsFormats,
  _updateAnySubset,
];
void users;
void chained;
