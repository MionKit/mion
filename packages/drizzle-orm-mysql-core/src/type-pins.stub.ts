/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Compile-time pins for the slim mysql surface (checked by tsc, not
// executed): mode/unsigned-dependent named types equal the builders' inferred
// data, and the model rules hold (the full rule matrix is pinned in the pg
// package; the shared machinery lives in @mionjs/drizzle-orm).

import type {
  BigInt64,
  BigUInt64,
  Date as RTDate,
  Integer as IntegerFormat,
  StringDateTime,
  UInt8,
} from '@ts-runtypes/core/formats';
import type {Bigint, ColDataOf, InferInsert, InferSelect, Int, Timestamp, Tinyint, Year} from './index.ts';
import {bigint, int, mysqlEnum, mysqlTable, serial, timestamp, tinyint, varchar, year} from './index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

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
};
type _bigNumber = Expect<Equal<ColDataOf<(typeof namedPins)['bigNumber']>, IntegerFormat>>;
type _bigBig = Expect<Equal<ColDataOf<(typeof namedPins)['bigBig']>, BigInt64>>;
type _bigUnsigned = Expect<Equal<ColDataOf<(typeof namedPins)['bigUnsigned']>, BigUInt64>>;
type _bigNamed = Expect<Equal<Bigint<'bigint', true>, BigUInt64>>;
type _int = Expect<Equal<ColDataOf<(typeof namedPins)['int']>, Int>>;
type _intUnsigned = Expect<Equal<ColDataOf<(typeof namedPins)['intUnsigned']>, Int<true>>>;
type _tinyUnsigned = Expect<Equal<ColDataOf<(typeof namedPins)['tinyUnsigned']>, Tinyint<true>>>;
type _tinyIsUInt8 = Expect<Equal<Tinyint<true>, UInt8>>;
type _year = Expect<Equal<ColDataOf<(typeof namedPins)['year']>, Year>>;
type _timestampString = Expect<Equal<ColDataOf<(typeof namedPins)['timestampString']>, StringDateTime>>;
type _timestampDate = Expect<Equal<ColDataOf<(typeof namedPins)['timestampDate']>, Timestamp>>;
type _timestampIsDate = Expect<Equal<Timestamp, RTDate>>;
type _enum = Expect<Equal<ColDataOf<(typeof namedPins)['enumCol']>, 'admin' | 'user'>>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed as a type by the pins
const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
type User = InferSelect<typeof users>;
type NewUser = InferInsert<typeof users>;
type _serialSelect = Expect<Equal<User['id'], ColDataOf<ReturnType<typeof serial>>>>;
type _serialInsertOptional = Expect<Equal<NewUser['id'], User['id'] | undefined>>;
type _insertDefaultedOptional = Expect<Equal<NewUser['createdAt'], RTDate | undefined>>;

export type _MySqlTypePins = [
  _bigNumber,
  _bigBig,
  _bigUnsigned,
  _bigNamed,
  _int,
  _intUnsigned,
  _tinyUnsigned,
  _tinyIsUInt8,
  _year,
  _timestampString,
  _timestampDate,
  _timestampIsDate,
  _enum,
  _serialSelect,
  _serialInsertOptional,
  _insertDefaultedOptional,
];
