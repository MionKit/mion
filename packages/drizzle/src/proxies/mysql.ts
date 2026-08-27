/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The @mionjs/drizzle/mysql proxy: the full drizzle-orm/mysql-core surface
// passes through unchanged, and the column builders below are shadowed by
// wrappers that forward the call verbatim while stamping the builder's data
// type with the matching runtype format (type-only, via drizzle's own $Type
// channel), capturing the caller's literal config params in OUR generics.
// Coverage is gated by packages/drizzle/drizzle-columns.manifest.json
// (`pnpm rtx core drizzle-manifest --check`); the mapping rules live in the
// drizzle-proxy-migration skill.
export * from 'drizzle-orm/mysql-core';

import {
  bigint as drizzleBigint,
  char as drizzleChar,
  date as drizzleDate,
  datetime as drizzleDatetime,
  decimal as drizzleDecimal,
  double as drizzleDouble,
  float as drizzleFloat,
  int as drizzleInt,
  longtext as drizzleLongtext,
  mediumint as drizzleMediumint,
  mediumtext as drizzleMediumtext,
  real as drizzleReal,
  serial as drizzleSerial,
  smallint as drizzleSmallint,
  text as drizzleText,
  time as drizzleTime,
  timestamp as drizzleTimestamp,
  tinyint as drizzleTinyint,
  tinytext as drizzleTinytext,
  varchar as drizzleVarchar,
  year as drizzleYear,
} from 'drizzle-orm/mysql-core';
import type {
  MySqlBigIntConfig,
  MySqlCharConfig,
  MySqlDateConfig,
  MySqlDatetimeConfig,
  MySqlDecimalConfig,
  MySqlDoubleConfig,
  MySqlFloatConfig,
  MySqlIntConfig,
  MySqlRealConfig,
  MySqlTextConfig,
  MySqlTimestampConfig,
  MySqlVarCharConfig,
  TimeConfig,
} from 'drizzle-orm/mysql-core';
import type {$Type, ColumnBuilderBase} from 'drizzle-orm/column-builder';
import type {Writable} from 'drizzle-orm/utils';
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
  StringDate,
  StringDateTime,
  StringTime,
  UInt8,
  UInt16,
  UInt32,
} from '@ts-runtypes/core/formats';

// Stamps Format unless the caller passed a literal enum (an enum's exact
// literal-union typing beats any string format, so it stays untouched).
type StampUnlessEnum<Builder extends ColumnBuilderBase, TEnum extends readonly string[], Format> = string extends TEnum[number]
  ? $Type<Builder, Format>
  : Builder;
type VarcharFormat<L> = L extends number ? Str<{maxLength: L}> : Str;
type CharFormat<L> = L extends number ? Str<{length: L}> : Str;
// MySQL mediumint has no preset int width; year is the DB's own 1901-2155 window.
type MediumInt = Num<{integer: true; min: -8388608; max: 8388607}>;
type UMediumInt = Num<{integer: true; min: 0; max: 16777215}>;
type YearFormat = Num<{integer: true; min: 1901; max: 2155}>;
// The runtime forward: every wrapper calls the drizzle builder untouched; the
// format exists only in the overload return types above each implementation.
type AnyCall = (...callArgs: unknown[]) => never;

export function bigint<TMode extends MySqlBigIntConfig['mode'], U extends boolean = false>(
  config: MySqlBigIntConfig<TMode> & {unsigned?: U}
): [TMode] extends ['number']
  ? $Type<ReturnType<typeof drizzleBigint<TMode>>, Integer>
  : $Type<ReturnType<typeof drizzleBigint<TMode>>, [U] extends [true] ? BigUInt64 : BigInt64>;
export function bigint<TName extends string, TMode extends MySqlBigIntConfig['mode'], U extends boolean = false>(
  name: TName,
  config: MySqlBigIntConfig<TMode> & {unsigned?: U}
): [TMode] extends ['number']
  ? $Type<ReturnType<typeof drizzleBigint<TName, TMode>>, Integer>
  : $Type<ReturnType<typeof drizzleBigint<TName, TMode>>, [U] extends [true] ? BigUInt64 : BigInt64>;
export function bigint(...args: unknown[]) {
  return (drizzleBigint as AnyCall)(...args);
}

export function char(): StampUnlessEnum<
  ReturnType<typeof drizzleChar<string, [string, ...string[]], undefined>>,
  [string, ...string[]],
  Str
>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  config?: MySqlCharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleChar<U, T, L>>, T, CharFormat<L>>;
export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  name: TName,
  config?: MySqlCharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleChar<TName, U, T, L>>, T, CharFormat<L>>;
export function char(...args: unknown[]) {
  return (drizzleChar as AnyCall)(...args);
}

export function date(): $Type<ReturnType<typeof drizzleDate>, RTDate>;
export function date<TMode extends MySqlDateConfig['mode'] & {}>(
  config?: MySqlDateConfig<TMode>
): [TMode] extends ['string']
  ? $Type<ReturnType<typeof drizzleDate<TMode>>, StringDate>
  : $Type<ReturnType<typeof drizzleDate<TMode>>, RTDate>;
export function date<TName extends string, TMode extends MySqlDateConfig['mode'] & {}>(
  name: TName,
  config?: MySqlDateConfig<TMode>
): [TMode] extends ['string']
  ? $Type<ReturnType<typeof drizzleDate<TName, TMode>>, StringDate>
  : $Type<ReturnType<typeof drizzleDate<TName, TMode>>, RTDate>;
export function date(...args: unknown[]) {
  return (drizzleDate as AnyCall)(...args);
}

export function datetime(): $Type<ReturnType<typeof drizzleDatetime>, RTDate>;
export function datetime<TMode extends MySqlDatetimeConfig['mode'] & {}>(
  config?: MySqlDatetimeConfig<TMode>
): [TMode] extends ['string']
  ? $Type<ReturnType<typeof drizzleDatetime<TMode>>, StringDateTime>
  : $Type<ReturnType<typeof drizzleDatetime<TMode>>, RTDate>;
export function datetime<TName extends string, TMode extends MySqlDatetimeConfig['mode'] & {}>(
  name: TName,
  config?: MySqlDatetimeConfig<TMode>
): [TMode] extends ['string']
  ? $Type<ReturnType<typeof drizzleDatetime<TName, TMode>>, StringDateTime>
  : $Type<ReturnType<typeof drizzleDatetime<TName, TMode>>, RTDate>;
export function datetime(...args: unknown[]) {
  return (drizzleDatetime as AnyCall)(...args);
}

// precision/scale are captured in OUR generics (drizzle's own types erase
// them); only mode 'number' gains a Num stamp, the default string mode and
// bigint mode pass through with drizzle's typing.
export function decimal(): ReturnType<typeof drizzleDecimal>;
export function decimal<TMode extends MySqlDecimalConfig['mode'] & {}, P extends number = number, S extends number = number>(
  config: MySqlDecimalConfig<TMode> & {precision?: P; scale?: S}
): [TMode] extends ['number'] ? $Type<ReturnType<typeof drizzleDecimal<TMode>>, Num> : ReturnType<typeof drizzleDecimal<TMode>>;
export function decimal<
  TName extends string,
  TMode extends MySqlDecimalConfig['mode'] & {},
  P extends number = number,
  S extends number = number,
>(
  name: TName,
  config?: MySqlDecimalConfig<TMode> & {precision?: P; scale?: S}
): [TMode] extends ['number']
  ? $Type<ReturnType<typeof drizzleDecimal<TName, TMode>>, Num>
  : ReturnType<typeof drizzleDecimal<TName, TMode>>;
export function decimal(...args: unknown[]) {
  return (drizzleDecimal as AnyCall)(...args);
}

export function double(): $Type<ReturnType<typeof drizzleDouble>, Num>;
export function double(config?: MySqlDoubleConfig): $Type<ReturnType<typeof drizzleDouble>, Num>;
export function double<TName extends string>(
  name: TName,
  config?: MySqlDoubleConfig
): $Type<ReturnType<typeof drizzleDouble<TName>>, Num>;
export function double(...args: unknown[]) {
  return (drizzleDouble as AnyCall)(...args);
}

export function float(): $Type<ReturnType<typeof drizzleFloat>, Num>;
export function float(config?: MySqlFloatConfig): $Type<ReturnType<typeof drizzleFloat>, Num>;
export function float<TName extends string>(
  name: TName,
  config?: MySqlFloatConfig
): $Type<ReturnType<typeof drizzleFloat<TName>>, Num>;
export function float(...args: unknown[]) {
  return (drizzleFloat as AnyCall)(...args);
}

export function int<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleInt>, [U] extends [true] ? UInt32 : Int32>;
export function int<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleInt<TName>>, [U] extends [true] ? UInt32 : Int32>;
export function int(...args: unknown[]) {
  return (drizzleInt as AnyCall)(...args);
}

export function longtext(): StampUnlessEnum<
  ReturnType<typeof drizzleLongtext<string, [string, ...string[]]>>,
  [string, ...string[]],
  Str
>;
export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleLongtext<U, T>>, T, Str>;
export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleLongtext<TName, U, T>>, T, Str>;
export function longtext(...args: unknown[]) {
  return (drizzleLongtext as AnyCall)(...args);
}

export function mediumint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleMediumint>, [U] extends [true] ? UMediumInt : MediumInt>;
export function mediumint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleMediumint<TName>>, [U] extends [true] ? UMediumInt : MediumInt>;
export function mediumint(...args: unknown[]) {
  return (drizzleMediumint as AnyCall)(...args);
}

export function mediumtext(): StampUnlessEnum<
  ReturnType<typeof drizzleMediumtext<string, [string, ...string[]]>>,
  [string, ...string[]],
  Str
>;
export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleMediumtext<U, T>>, T, Str>;
export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleMediumtext<TName, U, T>>, T, Str>;
export function mediumtext(...args: unknown[]) {
  return (drizzleMediumtext as AnyCall)(...args);
}

export function real(): $Type<ReturnType<typeof drizzleReal>, Num>;
export function real(config?: MySqlRealConfig): $Type<ReturnType<typeof drizzleReal>, Num>;
export function real<TName extends string>(
  name: TName,
  config?: MySqlRealConfig
): $Type<ReturnType<typeof drizzleReal<TName>>, Num>;
export function real(...args: unknown[]) {
  return (drizzleReal as AnyCall)(...args);
}

export function serial(): $Type<ReturnType<typeof drizzleSerial>, PositiveInt>;
export function serial<TName extends string>(name: TName): $Type<ReturnType<typeof drizzleSerial<TName>>, PositiveInt>;
export function serial(...args: unknown[]) {
  return (drizzleSerial as AnyCall)(...args);
}

export function smallint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleSmallint>, [U] extends [true] ? UInt16 : Int16>;
export function smallint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleSmallint<TName>>, [U] extends [true] ? UInt16 : Int16>;
export function smallint(...args: unknown[]) {
  return (drizzleSmallint as AnyCall)(...args);
}

export function text(): StampUnlessEnum<
  ReturnType<typeof drizzleText<string, [string, ...string[]]>>,
  [string, ...string[]],
  Str
>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleText<U, T>>, T, Str>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleText<TName, U, T>>, T, Str>;
export function text(...args: unknown[]) {
  return (drizzleText as AnyCall)(...args);
}

export function time(): $Type<ReturnType<typeof drizzleTime>, StringTime>;
export function time(config?: TimeConfig): $Type<ReturnType<typeof drizzleTime>, StringTime>;
export function time<TName extends string>(
  name: TName,
  config?: TimeConfig
): $Type<ReturnType<typeof drizzleTime<TName>>, StringTime>;
export function time(...args: unknown[]) {
  return (drizzleTime as AnyCall)(...args);
}

export function timestamp(): $Type<ReturnType<typeof drizzleTimestamp>, RTDate>;
export function timestamp<TMode extends MySqlTimestampConfig['mode'] & {}>(
  config?: MySqlTimestampConfig<TMode>
): [TMode] extends ['string']
  ? $Type<ReturnType<typeof drizzleTimestamp<TMode>>, StringDateTime>
  : $Type<ReturnType<typeof drizzleTimestamp<TMode>>, RTDate>;
export function timestamp<TName extends string, TMode extends MySqlTimestampConfig['mode'] & {}>(
  name: TName,
  config?: MySqlTimestampConfig<TMode>
): [TMode] extends ['string']
  ? $Type<ReturnType<typeof drizzleTimestamp<TName, TMode>>, StringDateTime>
  : $Type<ReturnType<typeof drizzleTimestamp<TName, TMode>>, RTDate>;
export function timestamp(...args: unknown[]) {
  return (drizzleTimestamp as AnyCall)(...args);
}

export function tinyint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleTinyint>, [U] extends [true] ? UInt8 : Int8>;
export function tinyint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): $Type<ReturnType<typeof drizzleTinyint<TName>>, [U] extends [true] ? UInt8 : Int8>;
export function tinyint(...args: unknown[]) {
  return (drizzleTinyint as AnyCall)(...args);
}

export function tinytext(): StampUnlessEnum<
  ReturnType<typeof drizzleTinytext<string, [string, ...string[]]>>,
  [string, ...string[]],
  Str
>;
export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleTinytext<U, T>>, T, Str>;
export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleTinytext<TName, U, T>>, T, Str>;
export function tinytext(...args: unknown[]) {
  return (drizzleTinytext as AnyCall)(...args);
}

export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  config: MySqlVarCharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleVarchar<U, T, L>>, T, VarcharFormat<L>>;
export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  name: TName,
  config: MySqlVarCharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleVarchar<TName, U, T, L>>, T, VarcharFormat<L>>;
export function varchar(...args: unknown[]) {
  return (drizzleVarchar as AnyCall)(...args);
}

export function year(): $Type<ReturnType<typeof drizzleYear>, YearFormat>;
export function year<TName extends string>(name: TName): $Type<ReturnType<typeof drizzleYear<TName>>, YearFormat>;
export function year(...args: unknown[]) {
  return (drizzleYear as AnyCall)(...args);
}
