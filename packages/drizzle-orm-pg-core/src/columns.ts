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
// Coverage is gated by manifests/pg.manifest.json (`pnpm miondevx core
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
} from '@mionjs/run-types/formats';
import type {
  AnyRtColumn,
  ColConfigArg,
  ColMods,
  ColRef,
  ColKeyFlags,
  ColNameArg,
  NoKeyFlags,
  RtColType,
  RtColumnKeyBrand,
  RtSql,
  SetIdentity,
  SetKeyFlag,
} from '@mionjs/drizzle-orm';
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
  $default(fn: () => Data | RtSql): RtPgColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data | RtSql): RtPgColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data | RtSql): RtPgColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data | RtSql): RtPgColumn<Data, N, true, X>;
  primaryKey(): RtPgColumn<Data, true, H, X>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgColumn<Data, N, true, true>;
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
  $default(fn: () => Data | RtSql): RtPgDateColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data | RtSql): RtPgDateColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data | RtSql): RtPgDateColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data | RtSql): RtPgDateColumn<Data, N, true, X>;
  defaultNow(): RtPgDateColumn<Data, N, true, X>;
  primaryKey(): RtPgDateColumn<Data, true, H, X>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgDateColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgDateColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgDateColumn<Data, N, true, true>;
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
  $default(fn: () => Data | RtSql): RtPgUuidColumn<Data, N, true, X>;
  $defaultFn(fn: () => Data | RtSql): RtPgUuidColumn<Data, N, true, X>;
  $onUpdate(fn: () => Data | RtSql): RtPgUuidColumn<Data, N, true, X>;
  $onUpdateFn(fn: () => Data | RtSql): RtPgUuidColumn<Data, N, true, X>;
  defaultRandom(): RtPgUuidColumn<Data, N, true, X>;
  primaryKey(): RtPgUuidColumn<Data, true, H, X>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgUuidColumn<Data, N, H, X>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgUuidColumn<Data, N, H, X>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgUuidColumn<Data, N, true, true>;
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
export interface RtPgIntColumn<Data, N extends boolean, H extends boolean, X extends boolean, K extends ColKeyFlags = NoKeyFlags>
  extends RtColumnBrand<Data, N, H, X>, RtColumnKeyBrand<K> {
  notNull(): RtPgIntColumn<Data, true, H, X, K>;
  default(value: Data | RtSql): RtPgIntColumn<Data, N, true, X, K>;
  $default(fn: () => Data | RtSql): RtPgIntColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $defaultFn(fn: () => Data | RtSql): RtPgIntColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $onUpdate(fn: () => Data | RtSql): RtPgIntColumn<Data, N, true, X, K>;
  $onUpdateFn(fn: () => Data | RtSql): RtPgIntColumn<Data, N, true, X, K>;
  primaryKey(): RtPgIntColumn<Data, true, H, X, SetKeyFlag<K, 'primaryKey'>>;
  unique(name?: string, config?: {nulls: 'distinct' | 'not distinct'}): RtPgIntColumn<Data, N, H, X, K>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtPgIntColumn<Data, N, H, X, K>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql)): RtPgIntColumn<Data, N, true, true, K>;
  /** Identity columns are NOT NULL; `always` also removes them from inserts. */
  generatedAlwaysAsIdentity(sequence?: PgIdentityConfig): RtPgIntColumn<Data, true, true, true, SetIdentity<K, 'always'>>;
  generatedByDefaultAsIdentity(sequence?: PgIdentityConfig): RtPgIntColumn<Data, true, true, X, SetIdentity<K, 'byDefault'>>;
  array(size?: number): RtPgColumn<Data[], N, H, X>;
  $type<T>(): RtPgIntColumn<T, N, H, X, K>;
}

// ── Modifier bags, one per kind interface ────────────────────────────────────
// What a column type may spell in its props object, beside the builder's own
// config keys. Each bag mirrors the chain of the kind interface above it, which
// is what makes `Varchar<'v', {autoincrement: true}>` an error rather than a
// silent no-op. Derived from manifests/pg.manifest.json.

/** The modifier calls every pg column type accepts (RtPgColumn's chain). */
export interface PgColMods extends Pick<
  ColMods,
  'notNull' | 'default' | 'generatedAlwaysAs' | 'array' | '$type' | '$default' | '$defaultFn' | '$onUpdate' | '$onUpdateFn'
> {
  primaryKey?: true;
  unique?: true | readonly [string] | readonly [string, {nulls: 'distinct' | 'not distinct'}];
  references?: readonly [ColRef] | readonly [ColRef, ReferenceActions];
}
/** date / time / timestamp: + defaultNow(). */
export interface PgDateColMods extends PgColMods {
  defaultNow?: true;
}
/** uuid: + defaultRandom(). */
export interface PgUuidColMods extends PgColMods {
  defaultRandom?: true;
}
/** smallint / integer / bigint: + the identity modifiers. */
export interface PgIntColMods extends PgColMods {
  generatedAlwaysAsIdentity?: true | readonly [PgIdentityConfig];
  generatedByDefaultAsIdentity?: true | readonly [PgIdentityConfig];
}

// ── Internal builder plumbing ────────────────────────────────────────────────

/** Record a call to the drizzle pg builder of the same name, args verbatim. */
function pgColumn(fnName: string, args: unknown[]): never {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[]))) as never;
}

// ── Named types + builders, one block per column function ────────────────────

export interface PgBigIntConfig<TMode extends 'number' | 'bigint' = 'number' | 'bigint'> {
  mode: TMode;
}
export type BigintDataOf<TMode> = TMode extends 'bigint' ? BigInt64 : IntegerFormat;
export type BigintData<C> = BigintDataOf<C extends {mode: infer TMode} ? TMode : 'number'>;
/** Column type twin of `bigint(name?, config)`. */
export type Bigint<
  A extends string | (PgBigIntConfig & PgIntColMods) | undefined = undefined,
  C extends PgBigIntConfig & PgIntColMods = PgBigIntConfig<'number'>,
> = RtColType<'bigint', ColNameArg<A>, ColConfigArg<A, C>, BigintData<ColConfigArg<A, C>>>;
export function bigint<TMode extends 'number' | 'bigint'>(
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<BigintDataOf<TMode>, false, false, false>;
export function bigint<TName extends string, TMode extends 'number' | 'bigint'>(
  name: TName,
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<BigintDataOf<TMode>, false, false, false>;
export function bigint(...args: unknown[]) {
  return pgColumn('bigint', args);
}

/** Column type twin of `bigserial(name?, config)`; intrinsically notNull + defaulted. */
export type Bigserial<
  A extends string | (PgBigIntConfig & PgColMods) | undefined = undefined,
  C extends PgBigIntConfig & PgColMods = PgBigIntConfig<'number'>,
> = RtColType<'bigserial', ColNameArg<A>, ColConfigArg<A, C>, BigintData<ColConfigArg<A, C>>, 'notNull' | 'hasDefault'>;
export function bigserial<TMode extends 'number' | 'bigint'>(
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<BigintDataOf<TMode>, true, true, false>;
export function bigserial<TName extends string, TMode extends 'number' | 'bigint'>(
  name: TName,
  config: PgBigIntConfig<TMode>
): RtPgIntColumn<BigintDataOf<TMode>, true, true, false>;
export function bigserial(...args: unknown[]) {
  return pgColumn('bigserial', args);
}

export interface PgBitConfig<D extends number = number> {
  dimensions: D;
}
export type BitDataOf<D> = D extends number ? Str<{length: D}> : Str;
export type BitData<C> = BitDataOf<C extends {dimensions: infer D} ? D : undefined>;
/** Column type twin of `bit(name?, config)`. */
export type Bit<
  A extends string | (Partial<PgBitConfig> & PgColMods) | undefined = undefined,
  C extends Partial<PgBitConfig> & PgColMods = Record<never, never>,
> = RtColType<'bit', ColNameArg<A>, ColConfigArg<A, C>, BitData<ColConfigArg<A, C>>>;
export function bit<D extends number>(config: PgBitConfig<D>): RtPgColumn<BitDataOf<D>, false, false, false>;
export function bit<TName extends string, D extends number>(
  name: TName,
  config: PgBitConfig<D>
): RtPgColumn<BitDataOf<D>, false, false, false>;
export function bit(...args: unknown[]) {
  return pgColumn('bit', args);
}

/** Column type twin of `boolean(name?)`. */
export type Boolean<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'boolean',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  boolean
>;
export function boolean(): RtPgColumn<boolean, false, false, false>;
export function boolean<TName extends string>(name: TName): RtPgColumn<boolean, false, false, false>;
export function boolean(...args: unknown[]) {
  return pgColumn('boolean', args);
}

export interface PgCharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length?: L;
  enum?: T;
}
export type CharDataOf<T extends readonly string[], L> = string extends T[number]
  ? L extends number
    ? Str<{length: L}>
    : Str
  : T[number];
export type CharData<C> = CharDataOf<
  C extends {enum: infer E extends readonly string[]} ? E : readonly string[],
  C extends {length: infer L extends number} ? L : undefined
>;
/** Column type twin of `char(name?, config?)`. */
export type Char<
  A extends string | (PgCharConfig & PgColMods) | undefined = undefined,
  C extends PgCharConfig & PgColMods = Record<never, never>,
> = RtColType<'char', ColNameArg<A>, ColConfigArg<A, C>, CharData<ColConfigArg<A, C>>>;
export function char(): RtPgColumn<Str, false, false, false>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config?: PgCharConfig<T | Writable<T>, L>
): RtPgColumn<CharDataOf<T, L>, false, false, false>;
export function char<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config?: PgCharConfig<T | Writable<T>, L>): RtPgColumn<CharDataOf<T, L>, false, false, false>;
export function char(...args: unknown[]) {
  return pgColumn('char', args);
}

/** Column type twin of `cidr(name?)`. */
export type Cidr<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'cidr',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  string
>;
export function cidr(): RtPgColumn<string, false, false, false>;
export function cidr<TName extends string>(name: TName): RtPgColumn<string, false, false, false>;
export function cidr(...args: unknown[]) {
  return pgColumn('cidr', args);
}

export interface PgDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
}
export type PgDateDataOf<TMode> = TMode extends 'date' ? RTDate : StringDate;
export type PgDateData<C> = PgDateDataOf<C extends {mode: infer TMode} ? TMode : 'string'>;
/** Column type twin of `date(name?, config?)` (`PgDate`: the global-Date dodge;
 *  the index also re-exports it as `Date`). */
export type PgDate<
  A extends string | (PgDateConfig & PgDateColMods) | undefined = undefined,
  C extends PgDateConfig & PgDateColMods = Record<never, never>,
> = RtColType<'date', ColNameArg<A>, ColConfigArg<A, C>, PgDateData<ColConfigArg<A, C>>>;
export function date(): RtPgDateColumn<StringDate, false, false, false>;
export function date<TMode extends 'date' | 'string' = 'string'>(
  config?: PgDateConfig<TMode>
): RtPgDateColumn<PgDateDataOf<TMode>, false, false, false>;
export function date<TName extends string, TMode extends 'date' | 'string' = 'string'>(
  name: TName,
  config?: PgDateConfig<TMode>
): RtPgDateColumn<PgDateDataOf<TMode>, false, false, false>;
export function date(...args: unknown[]) {
  return pgColumn('date', args);
}

export interface PgNumericConfig<TMode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: TMode;
  precision?: number;
  scale?: number;
}
export type NumericDataOf<TMode> = TMode extends 'number' ? Float : TMode extends 'bigint' ? bigint : string;
export type NumericData<C> = NumericDataOf<C extends {mode: infer TMode} ? TMode : 'string'>;
/** Column type twin of `numeric(name?, config?)`. */
export type Numeric<
  A extends string | (PgNumericConfig & PgColMods) | undefined = undefined,
  C extends PgNumericConfig & PgColMods = Record<never, never>,
> = RtColType<'numeric', ColNameArg<A>, ColConfigArg<A, C>, NumericData<ColConfigArg<A, C>>>;
export function numeric<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: PgNumericConfig<TMode>
): RtPgColumn<NumericDataOf<TMode>, false, false, false>;
export function numeric<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: PgNumericConfig<TMode>
): RtPgColumn<NumericDataOf<TMode>, false, false, false>;
export function numeric(...args: unknown[]) {
  return pgColumn('numeric', args);
}

/** Column type twin of `decimal(name?, config?)`. */
export type Decimal<
  A extends string | (PgNumericConfig & PgColMods) | undefined = undefined,
  C extends PgNumericConfig & PgColMods = Record<never, never>,
> = RtColType<'decimal', ColNameArg<A>, ColConfigArg<A, C>, NumericData<ColConfigArg<A, C>>>;
export function decimal<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: PgNumericConfig<TMode>
): RtPgColumn<NumericDataOf<TMode>, false, false, false>;
export function decimal<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: PgNumericConfig<TMode>
): RtPgColumn<NumericDataOf<TMode>, false, false, false>;
export function decimal(...args: unknown[]) {
  return pgColumn('decimal', args);
}

/** Column type twin of `doublePrecision(name?)`. */
export type DoublePrecision<
  A extends string | PgColMods | undefined = undefined,
  C extends PgColMods = Record<never, never>,
> = RtColType<'doublePrecision', ColNameArg<A>, ColConfigArg<A, C>, Float>;
export function doublePrecision(): RtPgColumn<Float, false, false, false>;
export function doublePrecision<TName extends string>(name: TName): RtPgColumn<Float, false, false, false>;
export function doublePrecision(...args: unknown[]) {
  return pgColumn('doublePrecision', args);
}

export interface PgGeometryConfig<TMode extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
  mode?: TMode;
  type?: string;
  srid?: number;
}
export type GeometryDataOf<TMode> = TMode extends 'xy' ? {x: number; y: number} : [number, number];
export type GeometryData<C> = GeometryDataOf<C extends {mode: infer TMode} ? TMode : 'tuple'>;
/** Column type twin of `geometry(name?, config?)`. */
export type Geometry<
  A extends string | (PgGeometryConfig & PgColMods) | undefined = undefined,
  C extends PgGeometryConfig & PgColMods = Record<never, never>,
> = RtColType<'geometry', ColNameArg<A>, ColConfigArg<A, C>, GeometryData<ColConfigArg<A, C>>>;
export function geometry(): RtPgColumn<GeometryDataOf<'tuple'>, false, false, false>;
export function geometry<TMode extends 'tuple' | 'xy' = 'tuple'>(
  config?: PgGeometryConfig<TMode>
): RtPgColumn<GeometryDataOf<TMode>, false, false, false>;
export function geometry<TName extends string, TMode extends 'tuple' | 'xy' = 'tuple'>(
  name: TName,
  config?: PgGeometryConfig<TMode>
): RtPgColumn<GeometryDataOf<TMode>, false, false, false>;
export function geometry(...args: unknown[]) {
  return pgColumn('geometry', args);
}

export interface PgVectorConfig<D extends number = number> {
  dimensions: D;
}
/** Column type twin of `halfvec(name?, config)`. */
export type Halfvec<
  A extends string | (Partial<PgVectorConfig> & PgColMods) | undefined = undefined,
  C extends Partial<PgVectorConfig> & PgColMods = Record<never, never>,
> = RtColType<'halfvec', ColNameArg<A>, ColConfigArg<A, C>, number[]>;
export function halfvec(config: PgVectorConfig): RtPgColumn<number[], false, false, false>;
export function halfvec<TName extends string>(name: TName, config: PgVectorConfig): RtPgColumn<number[], false, false, false>;
export function halfvec(...args: unknown[]) {
  return pgColumn('halfvec', args);
}

/** Column type twin of `inet(name?)`. */
export type Inet<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'inet',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  IP
>;
export function inet(): RtPgColumn<IP, false, false, false>;
export function inet<TName extends string>(name: TName): RtPgColumn<IP, false, false, false>;
export function inet(...args: unknown[]) {
  return pgColumn('inet', args);
}

/** Column type twin of `integer(name?)`. */
export type Integer<
  A extends string | PgIntColMods | undefined = undefined,
  C extends PgIntColMods = Record<never, never>,
> = RtColType<'integer', ColNameArg<A>, ColConfigArg<A, C>, Int32>;
export function integer(): RtPgIntColumn<Int32, false, false, false>;
export function integer<TName extends string>(name: TName): RtPgIntColumn<Int32, false, false, false>;
export function integer(...args: unknown[]) {
  return pgColumn('integer', args);
}

export interface IntervalConfig {
  fields?: string;
  precision?: number;
}
/** Column type twin of `interval(name?, config?)`. */
export type Interval<
  A extends string | (IntervalConfig & PgColMods) | undefined = undefined,
  C extends IntervalConfig & PgColMods = Record<never, never>,
> = RtColType<'interval', ColNameArg<A>, ColConfigArg<A, C>, string>;
export function interval(): RtPgColumn<string, false, false, false>;
export function interval(config?: IntervalConfig): RtPgColumn<string, false, false, false>;
export function interval<TName extends string>(name: TName, config?: IntervalConfig): RtPgColumn<string, false, false, false>;
export function interval(...args: unknown[]) {
  return pgColumn('interval', args);
}

/** Column type twin of `json(name?)`. */
export type Json<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'json',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  unknown
>;
export function json(): RtPgColumn<unknown, false, false, false>;
export function json<TName extends string>(name: TName): RtPgColumn<unknown, false, false, false>;
export function json(...args: unknown[]) {
  return pgColumn('json', args);
}

/** Column type twin of `jsonb(name?)`. */
export type Jsonb<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'jsonb',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  unknown
>;
export function jsonb(): RtPgColumn<unknown, false, false, false>;
export function jsonb<TName extends string>(name: TName): RtPgColumn<unknown, false, false, false>;
export function jsonb(...args: unknown[]) {
  return pgColumn('jsonb', args);
}

export interface PgLineConfig<TMode extends 'tuple' | 'abc' = 'tuple' | 'abc'> {
  mode?: TMode;
}
export type LineDataOf<TMode> = TMode extends 'abc' ? {a: number; b: number; c: number} : [number, number, number];
export type LineData<C> = LineDataOf<C extends {mode: infer TMode} ? TMode : 'tuple'>;
/** Column type twin of `line(name?, config?)`. */
export type Line<
  A extends string | (PgLineConfig & PgColMods) | undefined = undefined,
  C extends PgLineConfig & PgColMods = Record<never, never>,
> = RtColType<'line', ColNameArg<A>, ColConfigArg<A, C>, LineData<ColConfigArg<A, C>>>;
export function line(): RtPgColumn<LineDataOf<'tuple'>, false, false, false>;
export function line<TMode extends 'tuple' | 'abc' = 'tuple'>(
  config?: PgLineConfig<TMode>
): RtPgColumn<LineDataOf<TMode>, false, false, false>;
export function line<TName extends string, TMode extends 'tuple' | 'abc' = 'tuple'>(
  name: TName,
  config?: PgLineConfig<TMode>
): RtPgColumn<LineDataOf<TMode>, false, false, false>;
export function line(...args: unknown[]) {
  return pgColumn('line', args);
}

/** Column type twin of `macaddr(name?)`. */
export type Macaddr<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'macaddr',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  string
>;
export function macaddr(): RtPgColumn<string, false, false, false>;
export function macaddr<TName extends string>(name: TName): RtPgColumn<string, false, false, false>;
export function macaddr(...args: unknown[]) {
  return pgColumn('macaddr', args);
}

/** Column type twin of `macaddr8(name?)`. */
export type Macaddr8<
  A extends string | PgColMods | undefined = undefined,
  C extends PgColMods = Record<never, never>,
> = RtColType<'macaddr8', ColNameArg<A>, ColConfigArg<A, C>, string>;
export function macaddr8(): RtPgColumn<string, false, false, false>;
export function macaddr8<TName extends string>(name: TName): RtPgColumn<string, false, false, false>;
export function macaddr8(...args: unknown[]) {
  return pgColumn('macaddr8', args);
}

export interface PgPointConfig<TMode extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
  mode?: TMode;
}
export type PointDataOf<TMode> = TMode extends 'xy' ? {x: number; y: number} : [number, number];
export type PointData<C> = PointDataOf<C extends {mode: infer TMode} ? TMode : 'tuple'>;
/** Column type twin of `point(name?, config?)`. */
export type Point<
  A extends string | (PgPointConfig & PgColMods) | undefined = undefined,
  C extends PgPointConfig & PgColMods = Record<never, never>,
> = RtColType<'point', ColNameArg<A>, ColConfigArg<A, C>, PointData<ColConfigArg<A, C>>>;
export function point(): RtPgColumn<PointDataOf<'tuple'>, false, false, false>;
export function point<TMode extends 'tuple' | 'xy' = 'tuple'>(
  config?: PgPointConfig<TMode>
): RtPgColumn<PointDataOf<TMode>, false, false, false>;
export function point<TName extends string, TMode extends 'tuple' | 'xy' = 'tuple'>(
  name: TName,
  config?: PgPointConfig<TMode>
): RtPgColumn<PointDataOf<TMode>, false, false, false>;
export function point(...args: unknown[]) {
  return pgColumn('point', args);
}

/** Column type twin of `real(name?)`. */
export type Real<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'real',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  Float
>;
export function real(): RtPgColumn<Float, false, false, false>;
export function real<TName extends string>(name: TName): RtPgColumn<Float, false, false, false>;
export function real(...args: unknown[]) {
  return pgColumn('real', args);
}

/** Column type twin of `serial(name?)`; intrinsically notNull + defaulted. */
export type Serial<A extends string | PgColMods | undefined = undefined, C extends PgColMods = Record<never, never>> = RtColType<
  'serial',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  Int32,
  'notNull' | 'hasDefault'
>;
export function serial(): RtPgIntColumn<Int32, true, true, false>;
export function serial<TName extends string>(name: TName): RtPgIntColumn<Int32, true, true, false>;
export function serial(...args: unknown[]) {
  return pgColumn('serial', args);
}

/** Column type twin of `smallint(name?)`. */
export type Smallint<
  A extends string | PgIntColMods | undefined = undefined,
  C extends PgIntColMods = Record<never, never>,
> = RtColType<'smallint', ColNameArg<A>, ColConfigArg<A, C>, Int16>;
export function smallint(): RtPgIntColumn<Int16, false, false, false>;
export function smallint<TName extends string>(name: TName): RtPgIntColumn<Int16, false, false, false>;
export function smallint(...args: unknown[]) {
  return pgColumn('smallint', args);
}

/** Column type twin of `smallserial(name?)`; intrinsically notNull + defaulted. */
export type Smallserial<
  A extends string | PgColMods | undefined = undefined,
  C extends PgColMods = Record<never, never>,
> = RtColType<'smallserial', ColNameArg<A>, ColConfigArg<A, C>, Int16, 'notNull' | 'hasDefault'>;
export function smallserial(): RtPgIntColumn<Int16, true, true, false>;
export function smallserial<TName extends string>(name: TName): RtPgIntColumn<Int16, true, true, false>;
export function smallserial(...args: unknown[]) {
  return pgColumn('smallserial', args);
}

/** Column type twin of `sparsevec(name?, config)`. */
export type Sparsevec<
  A extends string | (Partial<PgVectorConfig> & PgColMods) | undefined = undefined,
  C extends Partial<PgVectorConfig> & PgColMods = Record<never, never>,
> = RtColType<'sparsevec', ColNameArg<A>, ColConfigArg<A, C>, string>;
export function sparsevec(config: PgVectorConfig): RtPgColumn<string, false, false, false>;
export function sparsevec<TName extends string>(name: TName, config: PgVectorConfig): RtPgColumn<string, false, false, false>;
export function sparsevec(...args: unknown[]) {
  return pgColumn('sparsevec', args);
}

export interface PgTextConfig<T extends readonly string[] = EnumTuple> {
  enum?: T;
}
export type TextDataOf<T extends readonly string[]> = EnumOr<T, Str>;
export type TextData<C> = TextDataOf<C extends {enum: infer E extends readonly string[]} ? E : readonly string[]>;
/** Column type twin of `text(name?, config?)`. */
export type Text<
  A extends string | (PgTextConfig & PgColMods) | undefined = undefined,
  C extends PgTextConfig & PgColMods = Record<never, never>,
> = RtColType<'text', ColNameArg<A>, ColConfigArg<A, C>, TextData<ColConfigArg<A, C>>>;
export function text(): RtPgColumn<Str, false, false, false>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: PgTextConfig<T | Writable<T>>
): RtPgColumn<TextDataOf<T>, false, false, false>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: PgTextConfig<T | Writable<T>>
): RtPgColumn<TextDataOf<T>, false, false, false>;
export function text(...args: unknown[]) {
  return pgColumn('text', args);
}

export interface TimeConfig {
  precision?: number;
  withTimezone?: boolean;
}
/** Column type twin of `time(name?, config?)`. */
export type Time<
  A extends string | (TimeConfig & PgDateColMods) | undefined = undefined,
  C extends TimeConfig & PgDateColMods = Record<never, never>,
> = RtColType<'time', ColNameArg<A>, ColConfigArg<A, C>, StringTime>;
export function time(): RtPgDateColumn<StringTime, false, false, false>;
export function time(config?: TimeConfig): RtPgDateColumn<StringTime, false, false, false>;
export function time<TName extends string>(name: TName, config?: TimeConfig): RtPgDateColumn<StringTime, false, false, false>;
export function time(...args: unknown[]) {
  return pgColumn('time', args);
}

export interface PgTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  precision?: number;
  withTimezone?: boolean;
}
export type TimestampDataOf<TMode> = TMode extends 'string' ? StringDateTime : RTDate;
export type TimestampData<C> = TimestampDataOf<C extends {mode: infer TMode} ? TMode : 'date'>;
/** Column type twin of `timestamp(name?, config?)`. */
export type Timestamp<
  A extends string | (PgTimestampConfig & PgDateColMods) | undefined = undefined,
  C extends PgTimestampConfig & PgDateColMods = Record<never, never>,
> = RtColType<'timestamp', ColNameArg<A>, ColConfigArg<A, C>, TimestampData<ColConfigArg<A, C>>>;
export function timestamp(): RtPgDateColumn<RTDate, false, false, false>;
export function timestamp<TMode extends 'date' | 'string' = 'date'>(
  config?: PgTimestampConfig<TMode>
): RtPgDateColumn<TimestampDataOf<TMode>, false, false, false>;
export function timestamp<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: PgTimestampConfig<TMode>
): RtPgDateColumn<TimestampDataOf<TMode>, false, false, false>;
export function timestamp(...args: unknown[]) {
  return pgColumn('timestamp', args);
}

/** Column type twin of `uuid(name?)`. */
export type Uuid<
  A extends string | PgUuidColMods | undefined = undefined,
  C extends PgUuidColMods = Record<never, never>,
> = RtColType<'uuid', ColNameArg<A>, ColConfigArg<A, C>, UUID>;
export function uuid(): RtPgUuidColumn<UUID, false, false, false>;
export function uuid<TName extends string>(name: TName): RtPgUuidColumn<UUID, false, false, false>;
export function uuid(...args: unknown[]) {
  return pgColumn('uuid', args);
}

export interface PgVarcharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length?: L;
  enum?: T;
}
/** Shared data computation of varchar, the anti-drift funnel of BOTH roads: a
 *  narrow enum wins, else length caps the string, else plain Str. The builder
 *  overloads call it with their inferred params; the column type extracts the
 *  same params from its config literal (VarcharData). */
export type VarcharDataOf<T extends readonly string[], L> = string extends T[number]
  ? L extends number
    ? Str<{maxLength: L}>
    : Str
  : T[number];
export type VarcharData<C> = VarcharDataOf<
  C extends {enum: infer E extends readonly string[]} ? E : readonly string[],
  C extends {length: infer L extends number} ? L : undefined
>;
/** Column type twin of `varchar(name?, config?)`. */
export type Varchar<
  A extends string | (PgVarcharConfig & PgColMods) | undefined = undefined,
  C extends PgVarcharConfig & PgColMods = Record<never, never>,
> = RtColType<'varchar', ColNameArg<A>, ColConfigArg<A, C>, VarcharData<ColConfigArg<A, C>>>;
export function varchar(): RtPgColumn<Str, false, false, false>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config?: PgVarcharConfig<T | Writable<T>, L>
): RtPgColumn<VarcharDataOf<T, L>, false, false, false>;
export function varchar<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config?: PgVarcharConfig<T | Writable<T>, L>): RtPgColumn<VarcharDataOf<T, L>, false, false, false>;
export function varchar(...args: unknown[]) {
  return pgColumn('varchar', args);
}

/** Column type twin of `vector(name?, config)`. */
export type Vector<
  A extends string | (Partial<PgVectorConfig> & PgColMods) | undefined = undefined,
  C extends Partial<PgVectorConfig> & PgColMods = Record<never, never>,
> = RtColType<'vector', ColNameArg<A>, ColConfigArg<A, C>, number[]>;
export function vector(config: PgVectorConfig): RtPgColumn<number[], false, false, false>;
export function vector<TName extends string>(name: TName, config: PgVectorConfig): RtPgColumn<number[], false, false, false>;
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
