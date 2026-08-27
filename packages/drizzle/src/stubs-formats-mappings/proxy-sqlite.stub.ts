/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-level pins for the @mionjs/drizzle/sqlite proxy builders. Never
// executed - compiled by tsconfig.stubs.json via type-inference.spec.ts.

import type {InferSelectModel} from 'drizzle-orm';
import {blob, int, integer, numeric, real, sqliteTable, text} from '../proxies/sqlite.ts';
import {text as drizzleText, integer as drizzleInteger} from 'drizzle-orm/sqlite-core';
import type {BigInt as RTBigInt, Date as RTDate, Integer, Number as Num, String as Str} from '@ts-runtypes/core/formats';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const notes = sqliteTable('notes', {
  id: integer('id').primaryKey(),
  altId: int('alt_id').notNull(),
  title: text('title', {length: 20}).notNull(),
  status: text('status', {enum: ['draft', 'final']}).notNull(),
  meta: text('meta', {mode: 'json'}).$type<{tags: string[]}>().notNull(),
  rating: real('rating').notNull(),
  price: numeric('price', {mode: 'number'}).notNull(),
  priceExact: numeric('price_exact').notNull(),
  total: blob('total', {mode: 'bigint'}).notNull(),
  archived: integer('archived', {mode: 'boolean'}).notNull(),
  createdAt: integer('created_at', {mode: 'timestamp'}).notNull(),
});

type NoteRow = InferSelectModel<typeof notes>;

type _integerDefaultMode = Assert<Equal<NoteRow['id'], Integer>>;
// int is the same wrapper as integer (drizzle's own alias, wrapped once)
type _intAlias = Assert<Equal<NoteRow['altId'], Integer>>;
type _textCapturesLength = Assert<Equal<NoteRow['title'], Str<{maxLength: 20}>>>;
// enum rule: literal union survives untouched
type _enumBeatsFormat = Assert<Equal<NoteRow['status'], 'draft' | 'final'>>;
// json mode passes through; the manual .$type escape hatch keeps working
type _jsonModeDollarType = Assert<Equal<NoteRow['meta'], {tags: string[]}>>;
type _realIsNum = Assert<Equal<NoteRow['rating'], Num>>;
type _numericNumberMode = Assert<Equal<NoteRow['price'], Num>>;
// default string mode passes through with drizzle's own typing
type _numericStringModePassthrough = Assert<Equal<NoteRow['priceExact'], string>>;
type _blobBigintMode = Assert<Equal<NoteRow['total'], RTBigInt>>;
// boolean mode passes through (no runtype format for booleans)
type _integerBooleanPassthrough = Assert<Equal<NoteRow['archived'], boolean>>;
type _integerTimestampIsDate = Assert<Equal<NoteRow['createdAt'], RTDate>>;

// wrapper params stay assignable to drizzle's own (overload fidelity)
type _textParamsCompatible = Assert<
  Parameters<typeof text<'n', string, [string, ...string[]], 20, 'text'>> extends Parameters<
    typeof drizzleText<'n', string, [string, ...string[]], 20, 'text'>
  >
    ? true
    : false
>;
type _integerParamsCompatible = Assert<
  Parameters<typeof integer<'n', 'timestamp'>> extends Parameters<typeof drizzleInteger<'n', 'timestamp'>> ? true : false
>;

export type _ProxySqlitePins = [
  _integerDefaultMode,
  _intAlias,
  _textCapturesLength,
  _enumBeatsFormat,
  _jsonModeDollarType,
  _realIsNum,
  _numericNumberMode,
  _numericStringModePassthrough,
  _blobBigintMode,
  _integerBooleanPassthrough,
  _integerTimestampIsDate,
  _textParamsCompatible,
  _integerParamsCompatible,
];
void notes;
