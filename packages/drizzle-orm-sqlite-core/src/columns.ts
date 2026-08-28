/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite column builders of @mionjs/drizzle-orm-sqlite-core: drizzle
// identical names and call params, slim recorder returns. ONE kind interface
// (sqlite builders share a single method set; autoIncrement rides the
// primaryKey config). Coverage is gated by manifests/sqlite.manifest.json;
// the completeness spec diffs the chain methods against drizzle's builder
// prototypes. Each builder exports its NAMED data type.

import type {BigInt as RTBigInt, Date as RTDate, Float, Integer as IntegerFormat, String as Str} from '@ts-runtypes/core/formats';
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

// ── The kind interface ───────────────────────────────────────────────────────

export interface SQLitePrimaryKeyConfig {
  autoIncrement?: boolean;
  onConflict?: 'rollback' | 'abort' | 'fail' | 'ignore' | 'replace';
}
export interface RtSqliteColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtSqliteColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtSqliteColumn<Data, N, true, X>;
  $default(fn: () => Data): RtSqliteColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data): RtSqliteColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data): RtSqliteColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data): RtSqliteColumn<Data, N, true, X>;
  /** With `autoIncrement: true` the column gains a database default too. */
  primaryKey(config: SQLitePrimaryKeyConfig & {autoIncrement: true}): RtSqliteColumn<Data, true, true, X>;
  primaryKey(config?: SQLitePrimaryKeyConfig): RtSqliteColumn<Data, true, H, X>;
  unique(name?: string): RtSqliteColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtSqliteColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql), config?: {mode?: 'virtual' | 'stored'}): RtSqliteColumn<Data, N, H, true>;
  $type<T>(): RtSqliteColumn<T, N, H, X>;
}

// ── Internal builder plumbing ────────────────────────────────────────────────

function sqliteColumn(fnName: string, args: unknown[]): never {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[]))) as never;
}

// ── Named types + builders, one block per column function ────────────────────

export type Blob<TMode extends 'buffer' | 'json' | 'bigint' = 'buffer'> = TMode extends 'bigint'
  ? RTBigInt
  : TMode extends 'json'
    ? unknown
    : Buffer;
export interface BlobConfig<TMode extends 'buffer' | 'json' | 'bigint' = 'buffer' | 'json' | 'bigint'> {
  mode: TMode;
}
export function blob(): RtSqliteColumn<Buffer, false, false, false>;
export function blob<TMode extends 'buffer' | 'json' | 'bigint' = 'buffer'>(
  config?: BlobConfig<TMode>
): RtSqliteColumn<Blob<TMode>, false, false, false>;
export function blob<TName extends string, TMode extends 'buffer' | 'json' | 'bigint' = 'buffer'>(
  name: TName,
  config?: BlobConfig<TMode>
): RtSqliteColumn<Blob<TMode>, false, false, false>;
export function blob(...args: unknown[]) {
  return sqliteColumn('blob', args);
}

export type Integer<TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'> = TMode extends
  | 'timestamp'
  | 'timestamp_ms'
  ? RTDate
  : TMode extends 'boolean'
    ? boolean
    : IntegerFormat;
export interface IntegerConfig<
  TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number' | 'timestamp' | 'timestamp_ms' | 'boolean',
> {
  mode: TMode;
}
export function integer(): RtSqliteColumn<IntegerFormat, false, false, false>;
export function integer<TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  config?: IntegerConfig<TMode>
): RtSqliteColumn<Integer<TMode>, false, false, false>;
export function integer<TName extends string, TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  name: TName,
  config?: IntegerConfig<TMode>
): RtSqliteColumn<Integer<TMode>, false, false, false>;
export function integer(...args: unknown[]) {
  return sqliteColumn('integer', args);
}

/** Alias of integer, drizzle's `int`. */
export function int(): RtSqliteColumn<IntegerFormat, false, false, false>;
export function int<TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  config?: IntegerConfig<TMode>
): RtSqliteColumn<Integer<TMode>, false, false, false>;
export function int<TName extends string, TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  name: TName,
  config?: IntegerConfig<TMode>
): RtSqliteColumn<Integer<TMode>, false, false, false>;
export function int(...args: unknown[]) {
  return sqliteColumn('int', args);
}

export type Numeric<TMode extends 'number' | 'string' | 'bigint' = 'string'> = TMode extends 'number'
  ? Float
  : TMode extends 'bigint'
    ? bigint
    : string;
export interface SQLiteNumericConfig<TMode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: TMode;
}
export function numeric<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: SQLiteNumericConfig<TMode>
): RtSqliteColumn<Numeric<TMode>, false, false, false>;
export function numeric<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: SQLiteNumericConfig<TMode>
): RtSqliteColumn<Numeric<TMode>, false, false, false>;
export function numeric(...args: unknown[]) {
  return sqliteColumn('numeric', args);
}

export type Real = Float;
export function real(): RtSqliteColumn<Real, false, false, false>;
export function real<TName extends string>(name: TName): RtSqliteColumn<Real, false, false, false>;
export function real(...args: unknown[]) {
  return sqliteColumn('real', args);
}

export type Text<L extends number | undefined = undefined> = L extends number ? Str<{maxLength: L}> : Str;
export interface SQLiteTextConfig<
  TMode extends 'text' | 'json' = 'text' | 'json',
  T extends readonly string[] = EnumTuple,
  L extends number | undefined = number | undefined,
> {
  mode?: TMode;
  enum?: T;
  length?: L;
}
export function text(): RtSqliteColumn<Str, false, false, false>;
export function text<
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
  TMode extends 'text' | 'json' = 'text',
>(
  config?: SQLiteTextConfig<TMode, T | Writable<T>, L>
): TMode extends 'json' ? RtSqliteColumn<unknown, false, false, false> : RtSqliteColumn<EnumOr<T, Text<L>>, false, false, false>;
export function text<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
  TMode extends 'text' | 'json' = 'text',
>(
  name: TName,
  config?: SQLiteTextConfig<TMode, T | Writable<T>, L>
): TMode extends 'json' ? RtSqliteColumn<unknown, false, false, false> : RtSqliteColumn<EnumOr<T, Text<L>>, false, false, false>;
export function text(...args: unknown[]) {
  return sqliteColumn('text', args);
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
  function factory(): RtSqliteColumn<T['data'], false, false, false>;
  function factory(config?: T['config']): RtSqliteColumn<T['data'], false, false, false>;
  function factory<TName extends string>(name: TName, config?: T['config']): RtSqliteColumn<T['data'], false, false, false>;
  function factory(...args: unknown[]) {
    return new RtColumnRecorder((context) => {
      const drizzleFactory = custom.toDrizzleValue(context) as (...factoryArgs: unknown[]) => unknown;
      return drizzleFactory(...args);
    }) as never;
  }
  (factory as unknown as Record<symbol, unknown>)[rtValueKey] = custom;
  return factory;
}

/** The record handed to a `sqliteTable` columns callback. */
export const sqliteColumnHelpers = {blob, customType, int, integer, numeric, real, text};
export type SQLiteColumnHelpers = typeof sqliteColumnHelpers;
