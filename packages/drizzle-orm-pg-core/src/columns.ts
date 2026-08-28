/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg column builders of @mionjs/drizzle-orm-pg-core: drizzle-identical
// names and call params, slim recorder returns. Every builder records its call
// (the recorder's init closure forwards the raw args to drizzle's builder of
// the same name at materialization) and returns one of FOUR kind interfaces,
// grouped by drizzle's own method sets:
//   RtPgColumn      the common chain every pg builder has
//   RtPgDateColumn  + defaultNow()            (date / time / timestamp)
//   RtPgUuidColumn  + defaultRandom()         (uuid)
//   RtPgIntColumn   + the identity modifiers  (smallint / integer / bigint)
// Coverage is gated by manifests/pg.manifest.json (`pnpm rtx core
// drizzle-manifest --check`); the completeness spec diffs the chain methods
// against drizzle's builder prototypes so a drizzle upgrade cannot silently
// add a modifier we do not record.
//
// Each builder also exports its NAMED data type (Varchar, Integer, Timestamp,
// ...), the pure-types vocabulary: a hand-written row using these names gets
// exactly the types the builders infer, with zero table machinery.

import type {
  BigInt64,
  Date as RTDate,
  Float,
  Int16,
  Int32,
  Integer as IntegerFormat,
  IP,
  String as Str,
  StringDate,
  StringDateTime,
  StringTime,
  UUID,
} from '@ts-runtypes/core/formats';
import type {AnyRtColumn, RtSql} from '@mionjs/drizzle-orm';
import {RtColumnRecorder, RtValueRecorder, rtValueKey} from '@mionjs/drizzle-orm';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
type EnumTuple = readonly [string, ...string[]];
/** A wide enum config (plain string[]) carries no literal union: fall back. */
type EnumOr<T extends readonly string[], Fallback> = string extends T[number] ? Fallback : T[number];

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';
export interface ReferenceActions {
  onDelete?: UpdateDeleteAction;
  onUpdate?: UpdateDeleteAction;
}

// ── The four kind interfaces ─────────────────────────────────────────────────

import type {RtColumnBrand} from '@mionjs/drizzle-orm';

export interface RtPgColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<Data, N, H, X> {
  notNull(): RtPgColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtPgColumn<Data, N, true, X>;
  $default(fn: () => Data): RtPgColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtPgColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtPgColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtPgColumn<Data, N, true, X>;
  primaryKey(): RtPgColumn<Data, true, H, X>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgColumn<Data, N, H, true>;
  array(size?: number): RtPgColumn<Data[], N, H, X>;
  $type<T>(): RtPgColumn<T, N, H, X>;
}

export interface RtPgDateColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtPgDateColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtPgDateColumn<Data, N, true, X>;
  $default(fn: () => Data): RtPgDateColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtPgDateColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtPgDateColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtPgDateColumn<Data, N, true, X>;
  defaultNow(): RtPgDateColumn<Data, N, true, X>;
  primaryKey(): RtPgDateColumn<Data, true, H, X>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgDateColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgDateColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgDateColumn<Data, N, H, true>;
  array(size?: number): RtPgColumn<Data[], N, H, X>;
  $type<T>(): RtPgDateColumn<T, N, H, X>;
}

export interface RtPgUuidColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtPgUuidColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtPgUuidColumn<Data, N, true, X>;
  $default(fn: () => Data): RtPgUuidColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtPgUuidColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtPgUuidColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtPgUuidColumn<Data, N, true, X>;
  defaultRandom(): RtPgUuidColumn<Data, N, true, X>;
  primaryKey(): RtPgUuidColumn<Data, true, H, X>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgUuidColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgUuidColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgUuidColumn<Data, N, H, true>;
  array(size?: number): RtPgColumn<Data[], N, H, X>;
  $type<T>(): RtPgUuidColumn<T, N, H, X>;
}

export interface PgIdentityConfig {
  name?: string;
  startWith?: number;
  increment?: number;
  minValue?: number;
  maxValue?: number;
  cache?: number;
  cycle?: boolean;
}
export interface RtPgIntColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtPgIntColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtPgIntColumn<Data, N, true, X>;
  $default(fn: () => Data): RtPgIntColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtPgIntColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtPgIntColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtPgIntColumn<Data, N, true, X>;
  primaryKey(): RtPgIntColumn<Data, true, H, X>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgIntColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgIntColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgIntColumn<Data, N, H, true>;
  /** Identity columns are NOT NULL; `always` also removes them from inserts. */
  generatedAlwaysAsIdentity(sequence?: PgIdentityConfig): RtPgIntColumn<Data, true, H, true>;
  generatedByDefaultAsIdentity(sequence?: PgIdentityConfig): RtPgIntColumn<Data, true, true, X>;
  array(size?: number): RtPgColumn<Data[], N, H, X>;
  $type<T>(): RtPgIntColumn<T, N, H, X>;
}

// ── Internal builder plumbing ────────────────────────────────────────────────

/** Record a call to the drizzle pg builder of the same name, args verbatim. */
function pgColumn(fnName: string, args: unknown[]): never {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[]))) as never;
}

// ── Named types + builders, one block per column function ────────────────────

export type Bigint<TMode extends 'number' | 'bigint' = 'number'> = TMode extends 'number' ? IntegerFormat : BigInt64;
export interface PgBigIntConfig<TMode extends 'number' | 'bigint' = 'number' | 'bigint'> {
  mode: TMode;
}
export function bigint<TMode extends 'number' | 'bigint'>(
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<Bigint<TMode>, false, false, false>;
export function bigint<TName extends string, TMode extends 'number' | 'bigint'>(
  name: TName,
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<Bigint<TMode>, false, false, false>;
export function bigint(...args: unknown[]) {
  return pgColumn('bigint', args);
}

export type Bigserial<TMode extends 'number' | 'bigint' = 'number'> = Bigint<TMode>;
export function bigserial<TMode extends 'number' | 'bigint'>(
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<Bigserial<TMode>, true, true, false>;
export function bigserial<TName extends string, TMode extends 'number' | 'bigint'>(
  name: TName,
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<Bigserial<TMode>, true, true, false>;
export function bigserial(...args: unknown[]) {
  return pgColumn('bigserial', args);
}

export type Bit<D extends number = number> = Str<{length: D}>;
export interface PgBitConfig<D extends number = number> {
  dimensions: D;
}
export function bit<D extends number>(config: PgBitConfig<D>): RtPgColumn<Bit<D>, false, false, false>;
export function bit<TName extends string, D extends number>(
  name: TName,
  config: PgBitConfig<D>
): RtPgColumn<Bit<D>, false, false, false>;
export function bit(...args: unknown[]) {
  return pgColumn('bit', args);
}

export type Boolean = boolean;
export function boolean(): RtPgColumn<Boolean, false, false, false>;
export function boolean<TName extends string>(name: TName): RtPgColumn<Boolean, false, false, false>;
export function boolean(...args: unknown[]) {
  return pgColumn('boolean', args);
}

export type Char<L extends number | undefined = undefined> = L extends number ? Str<{length: L}> : Str;
export interface PgCharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length?: L;
  enum?: T;
}
export function char(): RtPgColumn<Str, false, false, false>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config?: PgCharConfig<T | Writable<T>, L>
): RtPgColumn<EnumOr<T, Char<L>>, false, false, false>;
export function char<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config?: PgCharConfig<T | Writable<T>, L>): RtPgColumn<EnumOr<T, Char<L>>, false, false, false>;
export function char(...args: unknown[]) {
  return pgColumn('char', args);
}

export type Cidr = string;
export function cidr(): RtPgColumn<Cidr, false, false, false>;
export function cidr<TName extends string>(name: TName): RtPgColumn<Cidr, false, false, false>;
export function cidr(...args: unknown[]) {
  return pgColumn('cidr', args);
}

export type PgDate<TMode extends 'date' | 'string' = 'string'> = TMode extends 'date' ? RTDate : StringDate;
export interface PgDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
}
export function date(): RtPgDateColumn<StringDate, false, false, false>;
export function date<TMode extends 'date' | 'string' = 'string'>(
  config?: PgDateConfig<TMode>
): RtPgDateColumn<PgDate<TMode>, false, false, false>;
export function date<TName extends string, TMode extends 'date' | 'string' = 'string'>(
  name: TName,
  config?: PgDateConfig<TMode>
): RtPgDateColumn<PgDate<TMode>, false, false, false>;
export function date(...args: unknown[]) {
  return pgColumn('date', args);
}

export type Numeric<TMode extends 'number' | 'string' | 'bigint' = 'string'> = TMode extends 'number'
  ? Float
  : TMode extends 'bigint'
    ? bigint
    : string;
export interface PgNumericConfig<TMode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: TMode;
  precision?: number;
  scale?: number;
}
export function numeric<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: PgNumericConfig<TMode>
): RtPgColumn<Numeric<TMode>, false, false, false>;
export function numeric<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: PgNumericConfig<TMode>
): RtPgColumn<Numeric<TMode>, false, false, false>;
export function numeric(...args: unknown[]) {
  return pgColumn('numeric', args);
}

export type Decimal<TMode extends 'number' | 'string' | 'bigint' = 'string'> = Numeric<TMode>;
export function decimal<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: PgNumericConfig<TMode>
): RtPgColumn<Decimal<TMode>, false, false, false>;
export function decimal<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: PgNumericConfig<TMode>
): RtPgColumn<Decimal<TMode>, false, false, false>;
export function decimal(...args: unknown[]) {
  return pgColumn('decimal', args);
}

export type DoublePrecision = Float;
export function doublePrecision(): RtPgColumn<DoublePrecision, false, false, false>;
export function doublePrecision<TName extends string>(name: TName): RtPgColumn<DoublePrecision, false, false, false>;
export function doublePrecision(...args: unknown[]) {
  return pgColumn('doublePrecision', args);
}

export type Geometry<TMode extends 'tuple' | 'xy' = 'tuple'> = TMode extends 'xy' ? {x: number; y: number} : [number, number];
export interface PgGeometryConfig<TMode extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
  mode?: TMode;
  type?: string;
  srid?: number;
}
export function geometry(): RtPgColumn<Geometry, false, false, false>;
export function geometry<TMode extends 'tuple' | 'xy' = 'tuple'>(
  config?: PgGeometryConfig<TMode>
): RtPgColumn<Geometry<TMode>, false, false, false>;
export function geometry<TName extends string, TMode extends 'tuple' | 'xy' = 'tuple'>(
  name: TName,
  config?: PgGeometryConfig<TMode>
): RtPgColumn<Geometry<TMode>, false, false, false>;
export function geometry(...args: unknown[]) {
  return pgColumn('geometry', args);
}

export type Halfvec = number[];
export interface PgVectorConfig<D extends number = number> {
  dimensions: D;
}
export function halfvec(config: PgVectorConfig): RtPgColumn<Halfvec, false, false, false>;
export function halfvec<TName extends string>(name: TName, config: PgVectorConfig): RtPgColumn<Halfvec, false, false, false>;
export function halfvec(...args: unknown[]) {
  return pgColumn('halfvec', args);
}

export type Inet = IP;
export function inet(): RtPgColumn<Inet, false, false, false>;
export function inet<TName extends string>(name: TName): RtPgColumn<Inet, false, false, false>;
export function inet(...args: unknown[]) {
  return pgColumn('inet', args);
}

export type Integer = Int32;
export function integer(): RtPgIntColumn<Integer, false, false, false>;
export function integer<TName extends string>(name: TName): RtPgIntColumn<Integer, false, false, false>;
export function integer(...args: unknown[]) {
  return pgColumn('integer', args);
}

export type Interval = string;
export interface IntervalConfig {
  fields?: string;
  precision?: number;
}
export function interval(): RtPgColumn<Interval, false, false, false>;
export function interval(config?: IntervalConfig): RtPgColumn<Interval, false, false, false>;
export function interval<TName extends string>(name: TName, config?: IntervalConfig): RtPgColumn<Interval, false, false, false>;
export function interval(...args: unknown[]) {
  return pgColumn('interval', args);
}

export type Json = unknown;
export function json(): RtPgColumn<Json, false, false, false>;
export function json<TName extends string>(name: TName): RtPgColumn<Json, false, false, false>;
export function json(...args: unknown[]) {
  return pgColumn('json', args);
}

export type Jsonb = unknown;
export function jsonb(): RtPgColumn<Jsonb, false, false, false>;
export function jsonb<TName extends string>(name: TName): RtPgColumn<Jsonb, false, false, false>;
export function jsonb(...args: unknown[]) {
  return pgColumn('jsonb', args);
}

export type Line<TMode extends 'tuple' | 'abc' = 'tuple'> = TMode extends 'abc'
  ? {a: number; b: number; c: number}
  : [number, number, number];
export interface PgLineConfig<TMode extends 'tuple' | 'abc' = 'tuple' | 'abc'> {
  mode?: TMode;
}
export function line(): RtPgColumn<Line, false, false, false>;
export function line<TMode extends 'tuple' | 'abc' = 'tuple'>(
  config?: PgLineConfig<TMode>
): RtPgColumn<Line<TMode>, false, false, false>;
export function line<TName extends string, TMode extends 'tuple' | 'abc' = 'tuple'>(
  name: TName,
  config?: PgLineConfig<TMode>
): RtPgColumn<Line<TMode>, false, false, false>;
export function line(...args: unknown[]) {
  return pgColumn('line', args);
}

export type Macaddr = string;
export function macaddr(): RtPgColumn<Macaddr, false, false, false>;
export function macaddr<TName extends string>(name: TName): RtPgColumn<Macaddr, false, false, false>;
export function macaddr(...args: unknown[]) {
  return pgColumn('macaddr', args);
}

export type Macaddr8 = string;
export function macaddr8(): RtPgColumn<Macaddr8, false, false, false>;
export function macaddr8<TName extends string>(name: TName): RtPgColumn<Macaddr8, false, false, false>;
export function macaddr8(...args: unknown[]) {
  return pgColumn('macaddr8', args);
}

export type Point<TMode extends 'tuple' | 'xy' = 'tuple'> = TMode extends 'xy' ? {x: number; y: number} : [number, number];
export interface PgPointConfig<TMode extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
  mode?: TMode;
}
export function point(): RtPgColumn<Point, false, false, false>;
export function point<TMode extends 'tuple' | 'xy' = 'tuple'>(
  config?: PgPointConfig<TMode>
): RtPgColumn<Point<TMode>, false, false, false>;
export function point<TName extends string, TMode extends 'tuple' | 'xy' = 'tuple'>(
  name: TName,
  config?: PgPointConfig<TMode>
): RtPgColumn<Point<TMode>, false, false, false>;
export function point(...args: unknown[]) {
  return pgColumn('point', args);
}

export type Real = Float;
export function real(): RtPgColumn<Real, false, false, false>;
export function real<TName extends string>(name: TName): RtPgColumn<Real, false, false, false>;
export function real(...args: unknown[]) {
  return pgColumn('real', args);
}

export type Serial = Int32;
export function serial(): RtPgIntColumn<Serial, true, true, false>;
export function serial<TName extends string>(name: TName): RtPgIntColumn<Serial, true, true, false>;
export function serial(...args: unknown[]) {
  return pgColumn('serial', args);
}

export type Smallint = Int16;
export function smallint(): RtPgIntColumn<Smallint, false, false, false>;
export function smallint<TName extends string>(name: TName): RtPgIntColumn<Smallint, false, false, false>;
export function smallint(...args: unknown[]) {
  return pgColumn('smallint', args);
}

export type Smallserial = Int16;
export function smallserial(): RtPgIntColumn<Smallserial, true, true, false>;
export function smallserial<TName extends string>(name: TName): RtPgIntColumn<Smallserial, true, true, false>;
export function smallserial(...args: unknown[]) {
  return pgColumn('smallserial', args);
}

export type Sparsevec = string;
export function sparsevec(config: PgVectorConfig): RtPgColumn<Sparsevec, false, false, false>;
export function sparsevec<TName extends string>(name: TName, config: PgVectorConfig): RtPgColumn<Sparsevec, false, false, false>;
export function sparsevec(...args: unknown[]) {
  return pgColumn('sparsevec', args);
}

export type Text = Str;
export interface PgTextConfig<T extends readonly string[] = EnumTuple> {
  enum?: T;
}
export function text(): RtPgColumn<Text, false, false, false>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: PgTextConfig<T | Writable<T>>
): RtPgColumn<EnumOr<T, Text>, false, false, false>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: PgTextConfig<T | Writable<T>>
): RtPgColumn<EnumOr<T, Text>, false, false, false>;
export function text(...args: unknown[]) {
  return pgColumn('text', args);
}

export type Time = StringTime;
export interface TimeConfig {
  precision?: number;
  withTimezone?: boolean;
}
export function time(): RtPgDateColumn<Time, false, false, false>;
export function time(config?: TimeConfig): RtPgDateColumn<Time, false, false, false>;
export function time<TName extends string>(name: TName, config?: TimeConfig): RtPgDateColumn<Time, false, false, false>;
export function time(...args: unknown[]) {
  return pgColumn('time', args);
}

export type Timestamp<TMode extends 'date' | 'string' = 'date'> = TMode extends 'string' ? StringDateTime : RTDate;
export interface PgTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  precision?: number;
  withTimezone?: boolean;
}
export function timestamp(): RtPgDateColumn<RTDate, false, false, false>;
export function timestamp<TMode extends 'date' | 'string' = 'date'>(
  config?: PgTimestampConfig<TMode>
): RtPgDateColumn<Timestamp<TMode>, false, false, false>;
export function timestamp<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: PgTimestampConfig<TMode>
): RtPgDateColumn<Timestamp<TMode>, false, false, false>;
export function timestamp(...args: unknown[]) {
  return pgColumn('timestamp', args);
}

export type Uuid = UUID;
export function uuid(): RtPgUuidColumn<Uuid, false, false, false>;
export function uuid<TName extends string>(name: TName): RtPgUuidColumn<Uuid, false, false, false>;
export function uuid(...args: unknown[]) {
  return pgColumn('uuid', args);
}

export type Varchar<L extends number | undefined = undefined> = L extends number ? Str<{maxLength: L}> : Str;
export interface PgVarcharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length?: L;
  enum?: T;
}
export function varchar(): RtPgColumn<Str, false, false, false>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config?: PgVarcharConfig<T | Writable<T>, L>
): RtPgColumn<EnumOr<T, Varchar<L>>, false, false, false>;
export function varchar<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config?: PgVarcharConfig<T | Writable<T>, L>): RtPgColumn<EnumOr<T, Varchar<L>>, false, false, false>;
export function varchar(...args: unknown[]) {
  return pgColumn('varchar', args);
}

export type Vector = number[];
export function vector(config: PgVectorConfig): RtPgColumn<Vector, false, false, false>;
export function vector<TName extends string>(name: TName, config: PgVectorConfig): RtPgColumn<Vector, false, false, false>;
export function vector(...args: unknown[]) {
  return pgColumn('vector', args);
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
/** Drizzle's customType, recorded: the returned factory produces slim columns
 *  whose materializer builds the real custom column. The caller supplies the
 *  model type through T['data'] (formats included, if wanted). */
export function customType<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  const custom = new RtValueRecorder('customType', [params]);
  function factory(): RtPgColumn<T['data'], false, false, false>;
  function factory(config?: T['config']): RtPgColumn<T['data'], false, false, false>;
  function factory<TName extends string>(name: TName, config?: T['config']): RtPgColumn<T['data'], false, false, false>;
  function factory(...args: unknown[]) {
    return new RtColumnRecorder((context) => {
      const drizzleFactory = custom.toDrizzleValue(context) as (...factoryArgs: unknown[]) => unknown;
      return drizzleFactory(...args);
    }) as never;
  }
  (factory as unknown as Record<symbol, unknown>)[rtValueKey] = custom;
  return factory;
}

/** The record handed to a `pgTable` columns callback: every column builder,
 *  importable-free, mirroring drizzle's callback overload. */
export const pgColumnHelpers = {
  bigint,
  bigserial,
  bit,
  boolean,
  char,
  cidr,
  customType,
  date,
  decimal,
  doublePrecision,
  geometry,
  halfvec,
  inet,
  integer,
  interval,
  json,
  jsonb,
  line,
  macaddr,
  macaddr8,
  numeric,
  point,
  real,
  serial,
  smallint,
  smallserial,
  sparsevec,
  text,
  time,
  timestamp,
  uuid,
  varchar,
  vector,
};
export type PgColumnHelpers = typeof pgColumnHelpers;
