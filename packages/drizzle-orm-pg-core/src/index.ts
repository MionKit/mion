/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The @mionjs/drizzle-orm-pg-core root export: the full drizzle-orm/pg-core
// surface passes through unchanged, and the column builders below are shadowed
// by wrappers that forward the call verbatim while stamping the builder's data
// type with the matching runtype format (type-only, via drizzle's own $Type
// channel), capturing the caller's literal config params in OUR generics.
// Coverage is gated by manifests/pg.manifest.json
// (`pnpm rtx core drizzle-manifest --check`); the mapping rules live in the
// drizzle-proxy-migration skill.
export * from 'drizzle-orm/pg-core';
// refineTable + the model type utilities (InferSelect/InferInsert/InferUpdate
// and the re-exported standard SelectModel/InsertModel/UpdateModel).
export * from './refine.ts';

import {
  bigint as drizzleBigint,
  bigserial as drizzleBigserial,
  bit as drizzleBit,
  char as drizzleChar,
  date as drizzleDate,
  doublePrecision as drizzleDoublePrecision,
  inet as drizzleInet,
  integer as drizzleInteger,
  numeric as drizzleNumeric,
  real as drizzleReal,
  serial as drizzleSerial,
  smallint as drizzleSmallint,
  smallserial as drizzleSmallserial,
  text as drizzleText,
  time as drizzleTime,
  timestamp as drizzleTimestamp,
  uuid as drizzleUuid,
  varchar as drizzleVarchar,
} from 'drizzle-orm/pg-core';
import type {
  PgBigIntConfig,
  PgBigSerialConfig,
  PgBinaryVectorConfig,
  PgCharConfig,
  PgDateConfig,
  PgNumericConfig,
  PgTextConfig,
  PgTimestampConfig,
  PgVarcharConfig,
  TimeConfig,
} from 'drizzle-orm/pg-core';
import type {$Type, ColumnBuilderBase} from 'drizzle-orm/column-builder';
import type {Writable} from 'drizzle-orm/utils';
import type {
  BigInt64,
  Date as RTDate,
  Integer,
  Int16,
  Int32,
  IP,
  Float,
  String as Str,
  StringDate,
  StringDateTime,
  StringTime,
  UUID,
} from '@ts-runtypes/core/formats';

// Stamp: the format rides the builder's data type AND survives pg's .array()
// modifier. Drizzle's own array() re-derives the element type from the class
// generic (losing the $type brand), so the stamp intersects an array()
// override that carries Format[] - declared FIRST so it wins overload
// resolution. Chain other modifiers after .array(), drizzle's own idiom.
type Stamp<Builder extends PgArrayable, Format> = {
  array(size?: number): $Type<ReturnType<Builder['array']>, Format[]>;
} & $Type<Builder, Format>;
type PgArrayable = ColumnBuilderBase & {array: (size?: number) => ColumnBuilderBase};
// Stamps Format unless the caller passed a literal enum (an enum's exact
// literal-union typing beats any string format, so it stays untouched).
type StampUnlessEnum<Builder extends PgArrayable, TEnum extends readonly string[], Format> = string extends TEnum[number]
  ? Stamp<Builder, Format>
  : Builder;
type VarcharFormat<L> = L extends number ? Str<{maxLength: L}> : Str;
type CharFormat<L> = L extends number ? Str<{length: L}> : Str;
// The runtime forward: every wrapper calls the drizzle builder untouched; the
// format exists only in the overload return types above each implementation.
type AnyCall = (...callArgs: unknown[]) => never;

export function bigint<TMode extends PgBigIntConfig['mode']>(
  config: PgBigIntConfig<TMode>
): [TMode] extends ['number']
  ? Stamp<ReturnType<typeof drizzleBigint<TMode>>, Integer>
  : Stamp<ReturnType<typeof drizzleBigint<TMode>>, BigInt64>;
export function bigint<TName extends string, TMode extends PgBigIntConfig['mode']>(
  name: TName,
  config: PgBigIntConfig<TMode>
): [TMode] extends ['number']
  ? Stamp<ReturnType<typeof drizzleBigint<TName, TMode>>, Integer>
  : Stamp<ReturnType<typeof drizzleBigint<TName, TMode>>, BigInt64>;
export function bigint(...args: unknown[]) {
  return (drizzleBigint as AnyCall)(...args);
}

export function bigserial<TMode extends PgBigSerialConfig['mode']>(
  config: PgBigSerialConfig<TMode>
): [TMode] extends ['number']
  ? Stamp<ReturnType<typeof drizzleBigserial<TMode>>, Integer>
  : Stamp<ReturnType<typeof drizzleBigserial<TMode>>, BigInt64>;
export function bigserial<TName extends string, TMode extends PgBigSerialConfig['mode']>(
  name: TName,
  config: PgBigSerialConfig<TMode>
): [TMode] extends ['number']
  ? Stamp<ReturnType<typeof drizzleBigserial<TName, TMode>>, Integer>
  : Stamp<ReturnType<typeof drizzleBigserial<TName, TMode>>, BigInt64>;
export function bigserial(...args: unknown[]) {
  return (drizzleBigserial as AnyCall)(...args);
}

export function bit<D extends number>(config: PgBinaryVectorConfig<D>): Stamp<ReturnType<typeof drizzleBit<D>>, Str<{length: D}>>;
export function bit<TName extends string, D extends number>(
  name: TName,
  config: PgBinaryVectorConfig<D>
): Stamp<ReturnType<typeof drizzleBit<TName, D>>, Str<{length: D}>>;
export function bit(...args: unknown[]) {
  return (drizzleBit as AnyCall)(...args);
}

export function char(): StampUnlessEnum<
  ReturnType<typeof drizzleChar<string, [string, ...string[]], undefined>>,
  [string, ...string[]],
  Str
>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  config?: PgCharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleChar<U, T, L>>, T, CharFormat<L>>;
export function char<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  name: TName,
  config?: PgCharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleChar<TName, U, T, L>>, T, CharFormat<L>>;
export function char(...args: unknown[]) {
  return (drizzleChar as AnyCall)(...args);
}

export function date(): Stamp<ReturnType<typeof drizzleDate>, StringDate>;
export function date<TMode extends PgDateConfig['mode'] & {}>(
  config?: PgDateConfig<TMode>
): [TMode] extends ['date']
  ? Stamp<ReturnType<typeof drizzleDate<TMode>>, RTDate>
  : Stamp<ReturnType<typeof drizzleDate<TMode>>, StringDate>;
export function date<TName extends string, TMode extends PgDateConfig['mode'] & {}>(
  name: TName,
  config?: PgDateConfig<TMode>
): [TMode] extends ['date']
  ? Stamp<ReturnType<typeof drizzleDate<TName, TMode>>, RTDate>
  : Stamp<ReturnType<typeof drizzleDate<TName, TMode>>, StringDate>;
export function date(...args: unknown[]) {
  return (drizzleDate as AnyCall)(...args);
}

export function doublePrecision(): Stamp<ReturnType<typeof drizzleDoublePrecision>, Float>;
export function doublePrecision<TName extends string>(
  name: TName
): Stamp<ReturnType<typeof drizzleDoublePrecision<TName>>, Float>;
export function doublePrecision(...args: unknown[]) {
  return (drizzleDoublePrecision as AnyCall)(...args);
}

export function inet(): Stamp<ReturnType<typeof drizzleInet>, IP>;
export function inet<TName extends string>(name: TName): Stamp<ReturnType<typeof drizzleInet<TName>>, IP>;
export function inet(...args: unknown[]) {
  return (drizzleInet as AnyCall)(...args);
}

export function integer(): Stamp<ReturnType<typeof drizzleInteger>, Int32>;
export function integer<TName extends string>(name: TName): Stamp<ReturnType<typeof drizzleInteger<TName>>, Int32>;
export function integer(...args: unknown[]) {
  return (drizzleInteger as AnyCall)(...args);
}

// precision/scale are captured in OUR generics (drizzle's own types erase
// them, see stubs-formats-mappings/param-recovery.stub.ts); no number format
// param can express them yet, so only mode 'number' gains a Float stamp and the
// string/bigint modes pass through with drizzle's typing.
export function numeric<TMode extends PgNumericConfig['mode'] & {}, P extends number = number, S extends number = number>(
  config?: PgNumericConfig<TMode> & {precision?: P; scale?: S}
): [TMode] extends ['number'] ? Stamp<ReturnType<typeof drizzleNumeric<TMode>>, Float> : ReturnType<typeof drizzleNumeric<TMode>>;
export function numeric<
  TName extends string,
  TMode extends PgNumericConfig['mode'] & {},
  P extends number = number,
  S extends number = number,
>(
  name: TName,
  config?: PgNumericConfig<TMode> & {precision?: P; scale?: S}
): [TMode] extends ['number']
  ? Stamp<ReturnType<typeof drizzleNumeric<TName, TMode>>, Float>
  : ReturnType<typeof drizzleNumeric<TName, TMode>>;
export function numeric(...args: unknown[]) {
  return (drizzleNumeric as AnyCall)(...args);
}

export const decimal = numeric;

export function real(): Stamp<ReturnType<typeof drizzleReal>, Float>;
export function real<TName extends string>(name: TName): Stamp<ReturnType<typeof drizzleReal<TName>>, Float>;
export function real(...args: unknown[]) {
  return (drizzleReal as AnyCall)(...args);
}

export function serial(): Stamp<ReturnType<typeof drizzleSerial>, Int32>;
export function serial<TName extends string>(name: TName): Stamp<ReturnType<typeof drizzleSerial<TName>>, Int32>;
export function serial(...args: unknown[]) {
  return (drizzleSerial as AnyCall)(...args);
}

export function smallint(): Stamp<ReturnType<typeof drizzleSmallint>, Int16>;
export function smallint<TName extends string>(name: TName): Stamp<ReturnType<typeof drizzleSmallint<TName>>, Int16>;
export function smallint(...args: unknown[]) {
  return (drizzleSmallint as AnyCall)(...args);
}

export function smallserial(): Stamp<ReturnType<typeof drizzleSmallserial>, Int16>;
export function smallserial<TName extends string>(name: TName): Stamp<ReturnType<typeof drizzleSmallserial<TName>>, Int16>;
export function smallserial(...args: unknown[]) {
  return (drizzleSmallserial as AnyCall)(...args);
}

export function text(): StampUnlessEnum<
  ReturnType<typeof drizzleText<string, [string, ...string[]]>>,
  [string, ...string[]],
  Str
>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: PgTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleText<U, T>>, T, Str>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: PgTextConfig<T | Writable<T>>
): StampUnlessEnum<ReturnType<typeof drizzleText<TName, U, T>>, T, Str>;
export function text(...args: unknown[]) {
  return (drizzleText as AnyCall)(...args);
}

export function time(): Stamp<ReturnType<typeof drizzleTime>, StringTime>;
export function time(config?: TimeConfig): Stamp<ReturnType<typeof drizzleTime>, StringTime>;
export function time<TName extends string>(
  name: TName,
  config?: TimeConfig
): Stamp<ReturnType<typeof drizzleTime<TName>>, StringTime>;
export function time(...args: unknown[]) {
  return (drizzleTime as AnyCall)(...args);
}

export function timestamp(): Stamp<ReturnType<typeof drizzleTimestamp>, RTDate>;
export function timestamp<TMode extends PgTimestampConfig['mode'] & {}>(
  config?: PgTimestampConfig<TMode>
): [TMode] extends ['string']
  ? Stamp<ReturnType<typeof drizzleTimestamp<TMode>>, StringDateTime>
  : Stamp<ReturnType<typeof drizzleTimestamp<TMode>>, RTDate>;
export function timestamp<TName extends string, TMode extends PgTimestampConfig['mode'] & {}>(
  name: TName,
  config?: PgTimestampConfig<TMode>
): [TMode] extends ['string']
  ? Stamp<ReturnType<typeof drizzleTimestamp<TName, TMode>>, StringDateTime>
  : Stamp<ReturnType<typeof drizzleTimestamp<TName, TMode>>, RTDate>;
export function timestamp(...args: unknown[]) {
  return (drizzleTimestamp as AnyCall)(...args);
}

export function uuid(): Stamp<ReturnType<typeof drizzleUuid>, UUID>;
export function uuid<TName extends string>(name: TName): Stamp<ReturnType<typeof drizzleUuid<TName>>, UUID>;
export function uuid(...args: unknown[]) {
  return (drizzleUuid as AnyCall)(...args);
}

export function varchar(): StampUnlessEnum<
  ReturnType<typeof drizzleVarchar<string, [string, ...string[]], undefined>>,
  [string, ...string[]],
  Str
>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  config?: PgVarcharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleVarchar<U, T, L>>, T, VarcharFormat<L>>;
export function varchar<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
  name: TName,
  config?: PgVarcharConfig<T | Writable<T>, L>
): StampUnlessEnum<ReturnType<typeof drizzleVarchar<TName, U, T, L>>, T, VarcharFormat<L>>;
export function varchar(...args: unknown[]) {
  return (drizzleVarchar as AnyCall)(...args);
}
