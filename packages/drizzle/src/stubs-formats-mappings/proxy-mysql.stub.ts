/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type-level pins for the @mionjs/drizzle/mysql proxy builders. Never
// executed - compiled by tsconfig.stubs.json via type-inference.spec.ts.

import type {InferSelectModel} from 'drizzle-orm';
import {
  bigint,
  datetime,
  decimal,
  int,
  mysqlTable,
  serial,
  smallint,
  timestamp,
  tinyint,
  varchar,
  year,
} from '../proxies/mysql.ts';
import {varchar as drizzleVarchar, int as drizzleInt} from 'drizzle-orm/mysql-core';
import type {
  BigInt64,
  BigUInt64,
  Date as RTDate,
  Integer,
  Int8,
  Int16,
  Int32,
  Number as Num,
  PositiveInt,
  String as Str,
  StringDateTime,
  UInt32,
} from '@ts-runtypes/core/formats';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

const devices = mysqlTable('devices', {
  id: serial('id').primaryKey(),
  serialNo: varchar('serial_no', {length: 12}).notNull(),
  views: int('views', {unsigned: true}).notNull(),
  hops: int('hops').notNull(),
  offsetC: tinyint('offset_c').notNull(),
  port: smallint('port').notNull(),
  builtIn: year('built_in').notNull(),
  total: bigint('total', {mode: 'bigint'}).notNull(),
  totalUnsigned: bigint('total_unsigned', {mode: 'bigint', unsigned: true}).notNull(),
  approxCount: bigint('approx_count', {mode: 'number'}).notNull(),
  price: decimal('price', {precision: 10, scale: 2, mode: 'number'}).notNull(),
  priceExact: decimal('price_exact', {precision: 10, scale: 2}).notNull(),
  kind: varchar('kind', {length: 10, enum: ['sensor', 'relay']}).notNull(),
  seenAt: datetime('seen_at').notNull(),
  loggedAt: timestamp('logged_at', {mode: 'string'}).notNull(),
});

type DeviceRow = InferSelectModel<typeof devices>;

type _serialIsPositiveInt = Assert<Equal<DeviceRow['id'], PositiveInt>>;
type _varcharCapturesLength = Assert<Equal<DeviceRow['serialNo'], Str<{maxLength: 12}>>>;
type _unsignedInt = Assert<Equal<DeviceRow['views'], UInt32>>;
type _signedInt = Assert<Equal<DeviceRow['hops'], Int32>>;
type _tinyintIsInt8 = Assert<Equal<DeviceRow['offsetC'], Int8>>;
type _smallintIsInt16 = Assert<Equal<DeviceRow['port'], Int16>>;
type _yearWindow = Assert<Equal<DeviceRow['builtIn'], Num<{integer: true; min: 1901; max: 2155}>>>;
type _bigintModeBigint = Assert<Equal<DeviceRow['total'], BigInt64>>;
type _bigintUnsigned = Assert<Equal<DeviceRow['totalUnsigned'], BigUInt64>>;
type _bigintModeNumber = Assert<Equal<DeviceRow['approxCount'], Integer>>;
type _decimalNumberMode = Assert<Equal<DeviceRow['price'], Num>>;
// default string mode passes through with drizzle's own typing
type _decimalStringModePassthrough = Assert<Equal<DeviceRow['priceExact'], string>>;
// enum rule: literal union survives, even with a length in the config
type _enumBeatsFormat = Assert<Equal<DeviceRow['kind'], 'sensor' | 'relay'>>;
type _datetimeDefaultIsDate = Assert<Equal<DeviceRow['seenAt'], RTDate>>;
type _timestampStringMode = Assert<Equal<DeviceRow['loggedAt'], StringDateTime>>;

// wrapper params stay assignable to drizzle's own (overload fidelity)
type _varcharParamsCompatible = Assert<
  Parameters<typeof varchar<'n', string, [string, ...string[]], 10>> extends Parameters<
    typeof drizzleVarchar<'n', string, [string, ...string[]], 10>
  >
    ? true
    : false
>;
type _intParamsCompatible = Assert<
  Parameters<typeof int<'n', true>>[0] extends Parameters<typeof drizzleInt<'n'>>[0] ? true : false
>;

export type _ProxyMysqlPins = [
  _serialIsPositiveInt,
  _varcharCapturesLength,
  _unsignedInt,
  _signedInt,
  _tinyintIsInt8,
  _smallintIsInt16,
  _yearWindow,
  _bigintModeBigint,
  _bigintUnsigned,
  _bigintModeNumber,
  _decimalNumberMode,
  _decimalStringModePassthrough,
  _enumBeatsFormat,
  _datetimeDefaultIsDate,
  _timestampStringMode,
  _varcharParamsCompatible,
  _intParamsCompatible,
];
void devices;
