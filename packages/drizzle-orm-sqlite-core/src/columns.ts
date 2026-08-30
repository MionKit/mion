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
// prototypes.
//
// Each builder also exports its COLUMN TYPE (Integer, Text, ...), the
// pure-types vocabulary: a hand-written row using these names gets exactly the
// types the builders infer, with zero table machinery.

import type {BigInt as RTBigInt, Date as RTDate, Float, Integer as IntegerFormat, String as Str} from '@ts-runtypes/core/formats';
import type {AnyRtColumn, ColConfigArg, ColNameArg, RtColType, RtColumnBrand, RtSql} from '@mionjs/drizzle-orm';
import {RtColumnRecorder, RtValueRecorder, rtValueKey} from '@mionjs/drizzle-orm';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
type EnumTuple = readonly [string, ...string[]];

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
  $default(fn: () => Data | RtSql): RtSqliteColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data | RtSql): RtSqliteColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data | RtSql): RtSqliteColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data | RtSql): RtSqliteColumn<Data, N, true, X>;
  /** With `autoIncrement: true` the column gains a database default too. */
  primaryKey(config: SQLitePrimaryKeyConfig & {autoIncrement: true}): RtSqliteColumn<Data, true, true, X>;
  primaryKey(config?: SQLitePrimaryKeyConfig): RtSqliteColumn<Data, true, H, X>;
  unique(name?: string): RtSqliteColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtSqliteColumn<Data, N, H, X>;
  generatedAlwaysAs(
    as: Data | RtSql | (() => RtSql),
    config?: {mode?: 'virtual' | 'stored'}
  ): RtSqliteColumn<Data, N, true, true>;
  $type<T>(): RtSqliteColumn<T, N, H, X>;
}

/** The integer kind. sqlite's `integer primary key` IS the rowid, so drizzle
 *  gives it a database default with or without `autoIncrement` (its builder
 *  declares `primaryKeyHasDefault: true`, the only column in any dialect that
 *  does). Without this, `integer('id').primaryKey()` reads as required on
 *  insert and `db.insert(t).values({name: 'x'})` does not typecheck. */
export interface RtSqliteIntColumn<Data, N extends boolean, H extends boolean, X extends boolean> extends RtColumnBrand<
  Data,
  N,
  H,
  X
> {
  notNull(): RtSqliteIntColumn<Data, true, H, X>;
  default(value: Data | RtSql): RtSqliteIntColumn<Data, N, true, X>;
  $default(fn: () => Data | RtSql): RtSqliteIntColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data | RtSql): RtSqliteIntColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data | RtSql): RtSqliteIntColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data | RtSql): RtSqliteIntColumn<Data, N, true, X>;
  primaryKey(config?: SQLitePrimaryKeyConfig): RtSqliteIntColumn<Data, true, true, X>;
  unique(name?: string): RtSqliteIntColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtSqliteIntColumn<Data, N, H, X>;
  generatedAlwaysAs(
    as: Data | RtSql | (() => RtSql),
    config?: {mode?: 'virtual' | 'stored'}
  ): RtSqliteIntColumn<Data, N, true, true>;
  $type<T>(): RtSqliteIntColumn<T, N, H, X>;
}

// ── Internal builder plumbing ────────────────────────────────────────────────

function sqliteColumn(fnName: string, args: unknown[]): never {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[]))) as never;
}

// ── Named types + builders, one block per column function ────────────────────

export interface BlobConfig<TMode extends 'buffer' | 'json' | 'bigint' = 'buffer' | 'json' | 'bigint'> {
  mode: TMode;
}
export type BlobDataOf<TMode> = TMode extends 'bigint' ? RTBigInt : TMode extends 'json' ? unknown : Buffer;
export type BlobData<C> = BlobDataOf<C extends {mode: infer TMode} ? TMode : 'buffer'>;
/** Column type twin of `blob(name?, config?)`. */
export type Blob<
  A extends string | Partial<BlobConfig> | undefined = undefined,
  C extends Partial<BlobConfig> = Record<never, never>,
> = RtColType<'blob', ColNameArg<A>, ColConfigArg<A, C>, BlobData<ColConfigArg<A, C>>>;
export function blob(): RtSqliteColumn<Buffer, false, false, false>;
export function blob<TMode extends 'buffer' | 'json' | 'bigint' = 'buffer'>(
  config?: BlobConfig<TMode>
): RtSqliteColumn<BlobDataOf<TMode>, false, false, false>;
export function blob<TName extends string, TMode extends 'buffer' | 'json' | 'bigint' = 'buffer'>(
  name: TName,
  config?: BlobConfig<TMode>
): RtSqliteColumn<BlobDataOf<TMode>, false, false, false>;
export function blob(...args: unknown[]) {
  return sqliteColumn('blob', args);
}

export interface IntegerConfig<
  TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number' | 'timestamp' | 'timestamp_ms' | 'boolean',
> {
  mode: TMode;
}
export type IntegerDataOf<TMode> = TMode extends 'timestamp' | 'timestamp_ms'
  ? RTDate
  : TMode extends 'boolean'
    ? boolean
    : IntegerFormat;
export type IntegerData<C> = IntegerDataOf<C extends {mode: infer TMode} ? TMode : 'number'>;
/** Column type twin of `integer(name?, config?)`. */
export type Integer<
  A extends string | Partial<IntegerConfig> | undefined = undefined,
  C extends Partial<IntegerConfig> = Record<never, never>,
> = RtColType<'integer', ColNameArg<A>, ColConfigArg<A, C>, IntegerData<ColConfigArg<A, C>>, 'primaryKeyHasDefault'>;
export function integer(): RtSqliteIntColumn<IntegerFormat, false, false, false>;
export function integer<TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  config?: IntegerConfig<TMode>
): RtSqliteIntColumn<IntegerDataOf<TMode>, false, false, false>;
export function integer<TName extends string, TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  name: TName,
  config?: IntegerConfig<TMode>
): RtSqliteIntColumn<IntegerDataOf<TMode>, false, false, false>;
export function integer(...args: unknown[]) {
  return sqliteColumn('integer', args);
}

/** Column type twin of `int(name?, config?)`. Its own type rather than an alias
 *  of Integer: the recorded builder name is what a converted table prints back
 *  as, so sharing Integer's would rewrite every `int()` column as `integer()`.
 *  drizzle's own sqlite suites declare 13 tables with it. */
export type Int<
  A extends string | Partial<IntegerConfig> | undefined = undefined,
  C extends Partial<IntegerConfig> = Record<never, never>,
> = RtColType<'int', ColNameArg<A>, ColConfigArg<A, C>, IntegerData<ColConfigArg<A, C>>, 'primaryKeyHasDefault'>;
/** Alias of integer, drizzle's `int`. */
export function int(): RtSqliteIntColumn<IntegerFormat, false, false, false>;
export function int<TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  config?: IntegerConfig<TMode>
): RtSqliteIntColumn<IntegerDataOf<TMode>, false, false, false>;
export function int<TName extends string, TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number'>(
  name: TName,
  config?: IntegerConfig<TMode>
): RtSqliteIntColumn<IntegerDataOf<TMode>, false, false, false>;
export function int(...args: unknown[]) {
  return sqliteColumn('int', args);
}

export interface SQLiteNumericConfig<TMode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: TMode;
}
export type NumericDataOf<TMode> = TMode extends 'number' ? Float : TMode extends 'bigint' ? bigint : string;
export type NumericData<C> = NumericDataOf<C extends {mode: infer TMode} ? TMode : 'string'>;
/** Column type twin of `numeric(name?, config?)`. */
export type Numeric<
  A extends string | SQLiteNumericConfig | undefined = undefined,
  C extends SQLiteNumericConfig = Record<never, never>,
> = RtColType<'numeric', ColNameArg<A>, ColConfigArg<A, C>, NumericData<ColConfigArg<A, C>>>;
export function numeric<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: SQLiteNumericConfig<TMode>
): RtSqliteColumn<NumericDataOf<TMode>, false, false, false>;
export function numeric<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: SQLiteNumericConfig<TMode>
): RtSqliteColumn<NumericDataOf<TMode>, false, false, false>;
export function numeric(...args: unknown[]) {
  return sqliteColumn('numeric', args);
}

/** Column type twin of `real(name?)`. */
export type Real<Name extends string | undefined = undefined> = RtColType<'real', Name, Record<never, never>, Float>;
export function real(): RtSqliteColumn<Float, false, false, false>;
export function real<TName extends string>(name: TName): RtSqliteColumn<Float, false, false, false>;
export function real(...args: unknown[]) {
  return sqliteColumn('real', args);
}

export interface SQLiteTextConfig<
  TMode extends 'text' | 'json' = 'text' | 'json',
  T extends readonly string[] = EnumTuple,
  L extends number | undefined = number | undefined,
> {
  mode?: TMode;
  enum?: T;
  length?: L;
}
/** Shared data computation of text, the anti-drift funnel of BOTH roads: json
 *  mode wins, else a narrow enum, else length caps the string, else plain Str. */
export type TextDataOf<TMode, T extends readonly string[], L> = TMode extends 'json'
  ? unknown
  : string extends T[number]
    ? L extends number
      ? Str<{maxLength: L}>
      : Str
    : T[number];
export type TextData<C> = TextDataOf<
  C extends {mode: infer TMode} ? TMode : 'text',
  C extends {enum: infer E extends readonly string[]} ? E : readonly string[],
  C extends {length: infer L extends number} ? L : undefined
>;
/** Column type twin of `text(name?, config?)`. */
export type Text<
  A extends string | SQLiteTextConfig | undefined = undefined,
  C extends SQLiteTextConfig = Record<never, never>,
> = RtColType<'text', ColNameArg<A>, ColConfigArg<A, C>, TextData<ColConfigArg<A, C>>>;
export function text(): RtSqliteColumn<Str, false, false, false>;
export function text<
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
  TMode extends 'text' | 'json' = 'text',
>(config?: SQLiteTextConfig<TMode, T | Writable<T>, L>): RtSqliteColumn<TextDataOf<TMode, T, L>, false, false, false>;
export function text<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
  TMode extends 'text' | 'json' = 'text',
>(
  name: TName,
  config?: SQLiteTextConfig<TMode, T | Writable<T>, L>
): RtSqliteColumn<TextDataOf<TMode, T, L>, false, false, false>;
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
