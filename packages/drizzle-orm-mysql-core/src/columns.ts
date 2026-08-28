/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql column builders of @mionjs/drizzle-orm-mysql-core: drizzle
// identical names and call params, slim recorder returns. THREE kind
// interfaces, grouped by drizzle's own method sets:
//   RtMyColumn           the common chain every mysql builder has
//   RtMyIntColumn        + autoincrement()      (int family + serial)
//   RtMyTimestampColumn  + defaultNow() / onUpdateNow()
// Coverage is gated by manifests/mysql.manifest.json; the completeness spec
// diffs the chain methods against drizzle's builder prototypes. Each builder
// exports its NAMED data type (the pure-types vocabulary).

import type {
  BigInt64,
  BigUInt64,
  Date as RTDate,
  Float as FloatFormat,
  Int8,
  Int16,
  Int32,
  Integer as IntegerFormat,
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
import type {AnyRtColumn, RtColumnBrand, RtSql} from '@mionjs/drizzle-orm';
import {RtColumnRecorder, RtValueRecorder, rtValueKey} from '@mionjs/drizzle-orm';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
type EnumTuple = readonly [string, ...string[]];
type EnumOr<T extends readonly string[], Fallback> = string extends T[number] ? Fallback : T[number];

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';
export interface ReferenceActions {
  onDelete?: UpdateDeleteAction;
  onUpdate?: UpdateDeleteAction;
}

// ── The three kind interfaces ────────────────────────────────────────────────

export interface RtMyColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<Data, N, H, X> {
  notNull(): RtMyColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtMyColumn<Data, N, true, X>;
  $default(fn: () => Data): RtMyColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtMyColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtMyColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtMyColumn<Data, N, true, X>;
  primaryKey(): RtMyColumn<Data, true, H, X>;
  unique(name?: string): RtMyColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtMyColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql), config?: {mode?: 'virtual' | 'stored'}): RtMyColumn<Data, N, H, true>;
  $type<T>(): RtMyColumn<T, N, H, X>;
}

export interface RtMyIntColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtMyIntColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtMyIntColumn<Data, N, true, X>;
  $default(fn: () => Data): RtMyIntColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtMyIntColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtMyIntColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtMyIntColumn<Data, N, true, X>;
  autoincrement(): RtMyIntColumn<Data, N, true, X>;
  primaryKey(): RtMyIntColumn<Data, true, H, X>;
  unique(name?: string): RtMyIntColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtMyIntColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql), config?: {mode?: 'virtual' | 'stored'}): RtMyIntColumn<Data, N, H, true>;
  $type<T>(): RtMyIntColumn<T, N, H, X>;
}

export interface RtMyTimestampColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtMyTimestampColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtMyTimestampColumn<Data, N, true, X>;
  $default(fn: () => Data): RtMyTimestampColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtMyTimestampColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtMyTimestampColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtMyTimestampColumn<Data, N, true, X>;
  defaultNow(): RtMyTimestampColumn<Data, N, true, X>;
  onUpdateNow(): RtMyTimestampColumn<Data, N, true, X>;
  primaryKey(): RtMyTimestampColumn<Data, true, H, X>;
  unique(name?: string): RtMyTimestampColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtMyTimestampColumn<Data, N, H, X>;
  generatedAlwaysAs(
    as: Data | RtSql | (() => RtSql),
    config?: {mode?: 'virtual' | 'stored'}
  ): RtMyTimestampColumn<Data, N, H, true>;
  $type<T>(): RtMyTimestampColumn<T, N, H, X>;
}

// ── Internal builder plumbing ────────────────────────────────────────────────

function myColumn(fnName: string, args: unknown[]): never {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[]))) as never;
}

// ── Named types + builders, one block per column function ────────────────────

export type Bigint<TMode extends 'number' | 'bigint' = 'number', Unsigned extends boolean = false> = TMode extends 'number'
  ? IntegerFormat
  : Unsigned extends true
    ? BigUInt64
    : BigInt64;
export interface MySqlBigIntConfig<TMode extends 'number' | 'bigint' = 'number' | 'bigint'> {
  mode: TMode;
  unsigned?: boolean;
}
export function bigint<TMode extends 'number' | 'bigint', U extends boolean = false>(
  config: MySqlBigIntConfig<TMode> & {unsigned?: U}
): RtMyIntColumn<Bigint<TMode, U>, false, false, false>;
export function bigint<TName extends string, TMode extends 'number' | 'bigint', U extends boolean = false>(
  name: TName,
  config: MySqlBigIntConfig<TMode> & {unsigned?: U}
): RtMyIntColumn<Bigint<TMode, U>, false, false, false>;
export function bigint(...args: unknown[]) {
  return myColumn('bigint', args);
}

export type Binary = string;
export interface MySqlBinaryConfig {
  length?: number;
}
export function binary(): RtMyColumn<Binary, false, false, false>;
export function binary(config?: MySqlBinaryConfig): RtMyColumn<Binary, false, false, false>;
export function binary<TName extends string>(name: TName, config?: MySqlBinaryConfig): RtMyColumn<Binary, false, false, false>;
export function binary(...args: unknown[]) {
  return myColumn('binary', args);
}

export type Boolean = boolean;
export function boolean(): RtMyColumn<Boolean, false, false, false>;
export function boolean<TName extends string>(name: TName): RtMyColumn<Boolean, false, false, false>;
export function boolean(...args: unknown[]) {
  return myColumn('boolean', args);
}

export type Char<L extends number | undefined = undefined> = L extends number ? Str<{length: L}> : Str;
export interface MySqlCharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length?: L;
  enum?: T;
}
export function char(): RtMyColumn<Str, false, false, false>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config?: MySqlCharConfig<T | Writable<T>, L>
): RtMyColumn<EnumOr<T, Char<L>>, false, false, false>;
export function char<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config?: MySqlCharConfig<T | Writable<T>, L>): RtMyColumn<EnumOr<T, Char<L>>, false, false, false>;
export function char(...args: unknown[]) {
  return myColumn('char', args);
}

export type MySqlDate<TMode extends 'date' | 'string' = 'date'> = TMode extends 'string' ? StringDate : RTDate;
export interface MySqlDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
}
export function date(): RtMyColumn<RTDate, false, false, false>;
export function date<TMode extends 'date' | 'string' = 'date'>(
  config?: MySqlDateConfig<TMode>
): RtMyColumn<MySqlDate<TMode>, false, false, false>;
export function date<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: MySqlDateConfig<TMode>
): RtMyColumn<MySqlDate<TMode>, false, false, false>;
export function date(...args: unknown[]) {
  return myColumn('date', args);
}

export type Datetime<TMode extends 'date' | 'string' = 'date'> = TMode extends 'string' ? StringDateTime : RTDate;
export interface MySqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  fsp?: number;
}
export function datetime(): RtMyColumn<RTDate, false, false, false>;
export function datetime<TMode extends 'date' | 'string' = 'date'>(
  config?: MySqlDatetimeConfig<TMode>
): RtMyColumn<Datetime<TMode>, false, false, false>;
export function datetime<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: MySqlDatetimeConfig<TMode>
): RtMyColumn<Datetime<TMode>, false, false, false>;
export function datetime(...args: unknown[]) {
  return myColumn('datetime', args);
}

export type Decimal<TMode extends 'number' | 'string' | 'bigint' = 'string'> = TMode extends 'number'
  ? FloatFormat
  : TMode extends 'bigint'
    ? bigint
    : string;
export interface MySqlDecimalConfig<TMode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: TMode;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export function decimal(): RtMyColumn<Decimal, false, false, false>;
export function decimal<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: MySqlDecimalConfig<TMode>
): RtMyColumn<Decimal<TMode>, false, false, false>;
export function decimal<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: MySqlDecimalConfig<TMode>
): RtMyColumn<Decimal<TMode>, false, false, false>;
export function decimal(...args: unknown[]) {
  return myColumn('decimal', args);
}

export type Double = FloatFormat;
export interface MySqlDoubleConfig {
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export function double(): RtMyColumn<Double, false, false, false>;
export function double(config?: MySqlDoubleConfig): RtMyColumn<Double, false, false, false>;
export function double<TName extends string>(name: TName, config?: MySqlDoubleConfig): RtMyColumn<Double, false, false, false>;
export function double(...args: unknown[]) {
  return myColumn('double', args);
}

export type Float = FloatFormat;
export interface MySqlFloatConfig {
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export function float(): RtMyColumn<Float, false, false, false>;
export function float(config?: MySqlFloatConfig): RtMyColumn<Float, false, false, false>;
export function float<TName extends string>(name: TName, config?: MySqlFloatConfig): RtMyColumn<Float, false, false, false>;
export function float(...args: unknown[]) {
  return myColumn('float', args);
}

export type Int<Unsigned extends boolean = false> = Unsigned extends true ? UInt32 : Int32;
export interface MySqlIntConfig {
  unsigned?: boolean;
}
export function int<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Int<U>, false, false, false>;
export function int<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Int<U>, false, false, false>;
export function int(...args: unknown[]) {
  return myColumn('int', args);
}

export type Json = unknown;
export function json(): RtMyColumn<Json, false, false, false>;
export function json<TName extends string>(name: TName): RtMyColumn<Json, false, false, false>;
export function json(...args: unknown[]) {
  return myColumn('json', args);
}

export interface MySqlTextConfig<T extends readonly string[] = EnumTuple> {
  enum?: T;
}
export type Longtext = Str;
export function longtext(): RtMyColumn<Str, false, false, false>;
export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Longtext>, false, false, false>;
export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Longtext>, false, false, false>;
export function longtext(...args: unknown[]) {
  return myColumn('longtext', args);
}

export type Mediumint<Unsigned extends boolean = false> = Unsigned extends true
  ? Num<{integer: true; min: 0; max: 16777215}>
  : Num<{integer: true; min: -8388608; max: 8388607}>;
export function mediumint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Mediumint<U>, false, false, false>;
export function mediumint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Mediumint<U>, false, false, false>;
export function mediumint(...args: unknown[]) {
  return myColumn('mediumint', args);
}

export type Mediumtext = Str;
export function mediumtext(): RtMyColumn<Str, false, false, false>;
export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Mediumtext>, false, false, false>;
export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Mediumtext>, false, false, false>;
export function mediumtext(...args: unknown[]) {
  return myColumn('mediumtext', args);
}

/** mysqlEnum: a column function directly (values, or name + values). The
 *  drizzle enumObj overloads are covered by the same value forms. */
export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
  values: T | Writable<T>
): RtMyColumn<T[number], false, false, false>;
export function mysqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  values: T | Writable<T>
): RtMyColumn<T[number], false, false, false>;
export function mysqlEnum(...args: unknown[]) {
  return myColumn('mysqlEnum', args);
}

export type Real = FloatFormat;
export interface MySqlRealConfig {
  precision?: number;
  scale?: number;
}
export function real(): RtMyColumn<Real, false, false, false>;
export function real(config?: MySqlRealConfig): RtMyColumn<Real, false, false, false>;
export function real<TName extends string>(name: TName, config?: MySqlRealConfig): RtMyColumn<Real, false, false, false>;
export function real(...args: unknown[]) {
  return myColumn('real', args);
}

export type Serial = PositiveInt;
export function serial(): RtMyIntColumn<Serial, true, true, false>;
export function serial<TName extends string>(name: TName): RtMyIntColumn<Serial, true, true, false>;
export function serial(...args: unknown[]) {
  return myColumn('serial', args);
}

export type Smallint<Unsigned extends boolean = false> = Unsigned extends true ? UInt16 : Int16;
export function smallint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Smallint<U>, false, false, false>;
export function smallint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Smallint<U>, false, false, false>;
export function smallint(...args: unknown[]) {
  return myColumn('smallint', args);
}

export type Text = Str;
export function text(): RtMyColumn<Str, false, false, false>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Text>, false, false, false>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Text>, false, false, false>;
export function text(...args: unknown[]) {
  return myColumn('text', args);
}

export type Time = StringTime;
export interface TimeConfig {
  fsp?: number;
}
export function time(): RtMyColumn<Time, false, false, false>;
export function time(config?: TimeConfig): RtMyColumn<Time, false, false, false>;
export function time<TName extends string>(name: TName, config?: TimeConfig): RtMyColumn<Time, false, false, false>;
export function time(...args: unknown[]) {
  return myColumn('time', args);
}

export type Timestamp<TMode extends 'date' | 'string' = 'date'> = TMode extends 'string' ? StringDateTime : RTDate;
export interface MySqlTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  fsp?: number;
}
export function timestamp(): RtMyTimestampColumn<RTDate, false, false, false>;
export function timestamp<TMode extends 'date' | 'string' = 'date'>(
  config?: MySqlTimestampConfig<TMode>
): RtMyTimestampColumn<Timestamp<TMode>, false, false, false>;
export function timestamp<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: MySqlTimestampConfig<TMode>
): RtMyTimestampColumn<Timestamp<TMode>, false, false, false>;
export function timestamp(...args: unknown[]) {
  return myColumn('timestamp', args);
}

export type Tinyint<Unsigned extends boolean = false> = Unsigned extends true ? UInt8 : Int8;
export function tinyint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Tinyint<U>, false, false, false>;
export function tinyint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<Tinyint<U>, false, false, false>;
export function tinyint(...args: unknown[]) {
  return myColumn('tinyint', args);
}

export type Tinytext = Str;
export function tinytext(): RtMyColumn<Str, false, false, false>;
export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Tinytext>, false, false, false>;
export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<EnumOr<T, Tinytext>, false, false, false>;
export function tinytext(...args: unknown[]) {
  return myColumn('tinytext', args);
}

export type Varbinary = string;
export interface MySqlVarbinaryOptions {
  length: number;
}
export function varbinary(config: MySqlVarbinaryOptions): RtMyColumn<Varbinary, false, false, false>;
export function varbinary<TName extends string>(
  name: TName,
  config: MySqlVarbinaryOptions
): RtMyColumn<Varbinary, false, false, false>;
export function varbinary(...args: unknown[]) {
  return myColumn('varbinary', args);
}

export type Varchar<L extends number | undefined = undefined> = L extends number ? Str<{maxLength: L}> : Str;
export interface MySqlVarCharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length: L;
  enum?: T;
}
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config: MySqlVarCharConfig<T | Writable<T>, L>
): RtMyColumn<EnumOr<T, Varchar<L>>, false, false, false>;
export function varchar<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config: MySqlVarCharConfig<T | Writable<T>, L>): RtMyColumn<EnumOr<T, Varchar<L>>, false, false, false>;
export function varchar(...args: unknown[]) {
  return myColumn('varchar', args);
}

export type Year = Num<{integer: true; min: 1901; max: 2155}>;
export function year(): RtMyColumn<Year, false, false, false>;
export function year<TName extends string>(name: TName): RtMyColumn<Year, false, false, false>;
export function year(...args: unknown[]) {
  return myColumn('year', args);
}

// ── customType escape hatch ──────────────────────────────────────────────────

export interface CustomTypeValues {
  data: unknown;
  driverData?: unknown;
  config?: Record<string, unknown>;
  notNull?: boolean;
  default?: boolean;
}
export interface CustomTypeParams<T extends CustomTypeValues> {
  dataType(config?: T['config']): string;
  toDriver?(value: T['data']): unknown;
  fromDriver?(value: unknown): T['data'];
}
export function customType<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  const custom = new RtValueRecorder('customType', [params]);
  function factory(): RtMyColumn<T['data'], false, false, false>;
  function factory(config?: T['config']): RtMyColumn<T['data'], false, false, false>;
  function factory<TName extends string>(name: TName, config?: T['config']): RtMyColumn<T['data'], false, false, false>;
  function factory(...args: unknown[]) {
    return new RtColumnRecorder((context) => {
      const drizzleFactory = custom.toDrizzleValue(context) as (...factoryArgs: unknown[]) => unknown;
      return drizzleFactory(...args);
    }) as never;
  }
  (factory as unknown as Record<symbol, unknown>)[rtValueKey] = custom;
  return factory;
}

/** The record handed to a `mysqlTable` columns callback. */
export const mysqlColumnHelpers = {
  bigint,
  binary,
  boolean,
  char,
  customType,
  date,
  datetime,
  decimal,
  double,
  float,
  int,
  json,
  longtext,
  mediumint,
  mediumtext,
  mysqlEnum,
  real,
  serial,
  smallint,
  text,
  time,
  timestamp,
  tinyint,
  tinytext,
  varbinary,
  varchar,
  year,
};
export type MySqlColumnHelpers = typeof mysqlColumnHelpers;
