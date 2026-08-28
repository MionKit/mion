/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the slim sqlite surface (checked by tsc, not
// executed): mode-dependent named types equal the builders' inferred data,
// and the auto-increment primary key gains a default (optional insert). The
// full model rule matrix is pinned in the pg package; the shared machinery
// lives in @mionjs/drizzle-orm.

import type {BigInt as RTBigInt, Date as RTDate, Float, Integer as IntegerFormat, String as Str} from '@ts-runtypes/core/formats';
import type {ColDataOf, InferInsertModel, InferSelectModel} from '@mionjs/drizzle-orm';
import type {Blob, Integer, Numeric, Text} from './index.ts';
import {blob, integer, numeric, sqliteTable, text} from './index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const namedPins = {
  int: integer('i'),
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
type _int = Expect<Equal<ColDataOf<(typeof namedPins)['int']>, IntegerFormat>>;
type _intTimestamp = Expect<Equal<ColDataOf<(typeof namedPins)['intTimestamp']>, RTDate>>;
type _intBoolean = Expect<Equal<ColDataOf<(typeof namedPins)['intBoolean']>, boolean>>;
type _intNamed = Expect<Equal<Integer<'timestamp'>, RTDate>>;
type _blobBigint = Expect<Equal<ColDataOf<(typeof namedPins)['blobBigint']>, RTBigInt>>;
type _blobBuffer = Expect<Equal<ColDataOf<(typeof namedPins)['blobBuffer']>, Buffer>>;
type _blobNamed = Expect<Equal<Blob<'bigint'>, RTBigInt>>;
type _numericNumber = Expect<Equal<ColDataOf<(typeof namedPins)['numericNumber']>, Float>>;
type _numericString = Expect<Equal<ColDataOf<(typeof namedPins)['numericString']>, string>>;
type _numericNamed = Expect<Equal<Numeric<'number'>, Float>>;
type _text = Expect<Equal<ColDataOf<(typeof namedPins)['text']>, Str<{maxLength: 50}>>>;
type _textNamed = Expect<Equal<Text<50>, Str<{maxLength: 50}>>>;
type _textEnum = Expect<Equal<ColDataOf<(typeof namedPins)['textEnum']>, 'a' | 'b'>>;
type _textJson = Expect<Equal<ColDataOf<(typeof namedPins)['textJson']>, {x: number}>>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const users = sqliteTable('users', {
  id: integer('id').primaryKey({autoIncrement: true}),
  name: text('name').notNull(),
});
type User = InferSelectModel<typeof users>;
type NewUser = InferInsertModel<typeof users>;
type _pkSelect = Expect<Equal<User['id'], IntegerFormat>>;
type _pkAutoIncrementOptional = Expect<Equal<NewUser['id'], IntegerFormat | undefined>>;

export type _SqliteTypePins = [
  _int,
  _intTimestamp,
  _intBoolean,
  _intNamed,
  _blobBigint,
  _blobBuffer,
  _blobNamed,
  _numericNumber,
  _numericString,
  _numericNamed,
  _text,
  _textNamed,
  _textEnum,
  _textJson,
  _pkSelect,
  _pkAutoIncrementOptional,
];
