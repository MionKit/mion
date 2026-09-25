/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Side-by-side pg columns: a hand-written column type is one method-free Column, and every builder
// points at exactly that Column, so a builder table and a hand-written table are one type. The
// runtime is the shipped recorder, unchanged. Four builder kinds as in drizzle (common, +defaultNow,
// +defaultRandom, +identity); `.array()` falls back to the common kind.

import type {
  Date as RTDate,
  Float,
  Int16,
  Int32,
  IP,
  String as Str,
  StringDate,
  StringTime,
  UUID,
} from '@mionjs/run-types/formats';
import type {RtSql} from '../../drizzle-orm/src/recorder.ts';
import {RtColumnRecorder, RtValueRecorder, rtValueKey} from '../../drizzle-orm/src/recorder.ts';

/** Type-only: the column a builder builds (props flattened, no db name), what a builder table holds. */
export declare const rtBuiltColumnKey: unique symbol;
import type {
  ColBaseFlag,
  Column,
  ColumnName,
  ColumnOwner,
  Flat,
  NoProps,
  RefOf,
  Writable,
} from '../../drizzle-orm/next/columns.ts';
import type {
  BigintData,
  BitData,
  CharData,
  GeometryData,
  IntervalConfig,
  LineData,
  NumericData,
  PgBigIntConfig,
  PgBitConfig,
  PgCharConfig,
  PgColMods,
  PgDateColMods,
  PgDateConfig,
  PgDateData,
  PgGeometryConfig,
  PgIdentityConfig,
  PgIntColMods,
  PgLineConfig,
  PgNumericConfig,
  PgPointConfig,
  PgTextConfig,
  PgTimestampConfig,
  PgUuidColMods,
  PgVarcharConfig,
  PgVectorConfig,
  PointData,
  ReferenceActions,
  TextData,
  TimeConfig,
  TimestampData,
  VarcharData,
  CustomTypeParams,
  CustomTypeValues,
} from '../src/columns.ts';

// ── The four builder kinds ───────────────────────────────────────────────────
// Builders carry the chain, columns carry none: the runtype id walks method return types, so a column
// whose methods return a new column per call never resolves (MKR009). Each kind spells its whole
// chain and returns ITSELF: a shared chain returning the caller's kind through a lookup cost about 25
// instantiations per call.
/** How a chained call adds to the props. */
type Mod<P, M> = P & M;
type UniqueConfig = {nulls: 'distinct' | 'not distinct'};
type AnyOwner = ColumnOwner<string, string>;

/** The chain every pg column has. */
export interface PgColumnBuilder<
  Fn extends string,
  P,
  D,
  B extends ColBaseFlag = never,
  N extends string | undefined = undefined,
> extends ColumnName<N> {
  readonly [rtBuiltColumnKey]: Column<Fn, Flat<P>, D, B>;
  notNull(): PgColumnBuilder<Fn, Mod<P, {notNull: true}>, D, B, N>;
  default(value: RtSql): PgColumnBuilder<Fn, Mod<P, {default: [RtSql]}>, D, B, N>;
  default<const V extends D>(value: V): PgColumnBuilder<Fn, Mod<P, {default: [Writable<V>]}>, D, B, N>;
  $default(fn: () => D | RtSql): PgColumnBuilder<Fn, Mod<P, {$default: true}>, D, B, N>;
  $defaultFn(fn: () => D | RtSql): PgColumnBuilder<Fn, Mod<P, {$defaultFn: true}>, D, B, N>;
  $onUpdate(fn: () => D | RtSql): PgColumnBuilder<Fn, Mod<P, {$onUpdate: true}>, D, B, N>;
  $onUpdateFn(fn: () => D | RtSql): PgColumnBuilder<Fn, Mod<P, {$onUpdateFn: true}>, D, B, N>;
  primaryKey(): PgColumnBuilder<Fn, Mod<P, {primaryKey: true}>, D, B, N>;
  unique(): PgColumnBuilder<Fn, Mod<P, {unique: true}>, D, B, N>;
  unique<const Name extends string>(name: Name): PgColumnBuilder<Fn, Mod<P, {unique: [Name]}>, D, B, N>;
  unique<const Name extends string, const C extends UniqueConfig>(
    name: Name,
    config: C
  ): PgColumnBuilder<Fn, Mod<P, {unique: [Name, Writable<C>]}>, D, B, N>;
  references<R extends AnyOwner>(ref: () => R): PgColumnBuilder<Fn, Mod<P, {references: [RefOf<R>]}>, D, B, N>;
  references<R extends AnyOwner, const A extends ReferenceActions>(
    ref: () => R,
    actions: A
  ): PgColumnBuilder<Fn, Mod<P, {references: [RefOf<R>, Writable<A>]}>, D, B, N>;
  generatedAlwaysAs(as: RtSql | (() => RtSql)): PgColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [RtSql]}>, D, B, N>;
  generatedAlwaysAs<const V extends D>(as: V): PgColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [Writable<V>]}>, D, B, N>;
  array(): PgColumnBuilder<Fn, Mod<P, {array: true}>, D, B, N>;
  array<const S extends number>(size: S): PgColumnBuilder<Fn, Mod<P, {array: [S]}>, D, B, N>;
  $type<T>(): PgColumnBuilder<Fn, Mod<P, {$type: [T]}>, D, B, N>;
}
/** date / time / timestamp: + defaultNow(). */
export interface PgDateColumnBuilder<
  Fn extends string,
  P,
  D,
  B extends ColBaseFlag = never,
  N extends string | undefined = undefined,
> extends ColumnName<N> {
  readonly [rtBuiltColumnKey]: Column<Fn, Flat<P>, D, B>;
  notNull(): PgDateColumnBuilder<Fn, Mod<P, {notNull: true}>, D, B, N>;
  default(value: RtSql): PgDateColumnBuilder<Fn, Mod<P, {default: [RtSql]}>, D, B, N>;
  default<const V extends D>(value: V): PgDateColumnBuilder<Fn, Mod<P, {default: [Writable<V>]}>, D, B, N>;
  $default(fn: () => D | RtSql): PgDateColumnBuilder<Fn, Mod<P, {$default: true}>, D, B, N>;
  $defaultFn(fn: () => D | RtSql): PgDateColumnBuilder<Fn, Mod<P, {$defaultFn: true}>, D, B, N>;
  $onUpdate(fn: () => D | RtSql): PgDateColumnBuilder<Fn, Mod<P, {$onUpdate: true}>, D, B, N>;
  $onUpdateFn(fn: () => D | RtSql): PgDateColumnBuilder<Fn, Mod<P, {$onUpdateFn: true}>, D, B, N>;
  primaryKey(): PgDateColumnBuilder<Fn, Mod<P, {primaryKey: true}>, D, B, N>;
  unique(): PgDateColumnBuilder<Fn, Mod<P, {unique: true}>, D, B, N>;
  unique<const Name extends string>(name: Name): PgDateColumnBuilder<Fn, Mod<P, {unique: [Name]}>, D, B, N>;
  unique<const Name extends string, const C extends UniqueConfig>(
    name: Name,
    config: C
  ): PgDateColumnBuilder<Fn, Mod<P, {unique: [Name, Writable<C>]}>, D, B, N>;
  references<R extends AnyOwner>(ref: () => R): PgDateColumnBuilder<Fn, Mod<P, {references: [RefOf<R>]}>, D, B, N>;
  references<R extends AnyOwner, const A extends ReferenceActions>(
    ref: () => R,
    actions: A
  ): PgDateColumnBuilder<Fn, Mod<P, {references: [RefOf<R>, Writable<A>]}>, D, B, N>;
  generatedAlwaysAs(as: RtSql | (() => RtSql)): PgDateColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [RtSql]}>, D, B, N>;
  generatedAlwaysAs<const V extends D>(as: V): PgDateColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [Writable<V>]}>, D, B, N>;
  array(): PgColumnBuilder<Fn, Mod<P, {array: true}>, D, B, N>;
  array<const S extends number>(size: S): PgColumnBuilder<Fn, Mod<P, {array: [S]}>, D, B, N>;
  $type<T>(): PgDateColumnBuilder<Fn, Mod<P, {$type: [T]}>, D, B, N>;
  defaultNow(): PgDateColumnBuilder<Fn, Mod<P, {defaultNow: true}>, D, B, N>;
}
/** uuid: + defaultRandom(). */
export interface PgUuidColumnBuilder<
  Fn extends string,
  P,
  D,
  B extends ColBaseFlag = never,
  N extends string | undefined = undefined,
> extends ColumnName<N> {
  readonly [rtBuiltColumnKey]: Column<Fn, Flat<P>, D, B>;
  notNull(): PgUuidColumnBuilder<Fn, Mod<P, {notNull: true}>, D, B, N>;
  default(value: RtSql): PgUuidColumnBuilder<Fn, Mod<P, {default: [RtSql]}>, D, B, N>;
  default<const V extends D>(value: V): PgUuidColumnBuilder<Fn, Mod<P, {default: [Writable<V>]}>, D, B, N>;
  $default(fn: () => D | RtSql): PgUuidColumnBuilder<Fn, Mod<P, {$default: true}>, D, B, N>;
  $defaultFn(fn: () => D | RtSql): PgUuidColumnBuilder<Fn, Mod<P, {$defaultFn: true}>, D, B, N>;
  $onUpdate(fn: () => D | RtSql): PgUuidColumnBuilder<Fn, Mod<P, {$onUpdate: true}>, D, B, N>;
  $onUpdateFn(fn: () => D | RtSql): PgUuidColumnBuilder<Fn, Mod<P, {$onUpdateFn: true}>, D, B, N>;
  primaryKey(): PgUuidColumnBuilder<Fn, Mod<P, {primaryKey: true}>, D, B, N>;
  unique(): PgUuidColumnBuilder<Fn, Mod<P, {unique: true}>, D, B, N>;
  unique<const Name extends string>(name: Name): PgUuidColumnBuilder<Fn, Mod<P, {unique: [Name]}>, D, B, N>;
  unique<const Name extends string, const C extends UniqueConfig>(
    name: Name,
    config: C
  ): PgUuidColumnBuilder<Fn, Mod<P, {unique: [Name, Writable<C>]}>, D, B, N>;
  references<R extends AnyOwner>(ref: () => R): PgUuidColumnBuilder<Fn, Mod<P, {references: [RefOf<R>]}>, D, B, N>;
  references<R extends AnyOwner, const A extends ReferenceActions>(
    ref: () => R,
    actions: A
  ): PgUuidColumnBuilder<Fn, Mod<P, {references: [RefOf<R>, Writable<A>]}>, D, B, N>;
  generatedAlwaysAs(as: RtSql | (() => RtSql)): PgUuidColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [RtSql]}>, D, B, N>;
  generatedAlwaysAs<const V extends D>(as: V): PgUuidColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [Writable<V>]}>, D, B, N>;
  array(): PgColumnBuilder<Fn, Mod<P, {array: true}>, D, B, N>;
  array<const S extends number>(size: S): PgColumnBuilder<Fn, Mod<P, {array: [S]}>, D, B, N>;
  $type<T>(): PgUuidColumnBuilder<Fn, Mod<P, {$type: [T]}>, D, B, N>;
  defaultRandom(): PgUuidColumnBuilder<Fn, Mod<P, {defaultRandom: true}>, D, B, N>;
}
/** smallint / integer / bigint: + the identity modifiers. */
export interface PgIntColumnBuilder<
  Fn extends string,
  P,
  D,
  B extends ColBaseFlag = never,
  N extends string | undefined = undefined,
> extends ColumnName<N> {
  readonly [rtBuiltColumnKey]: Column<Fn, Flat<P>, D, B>;
  notNull(): PgIntColumnBuilder<Fn, Mod<P, {notNull: true}>, D, B, N>;
  default(value: RtSql): PgIntColumnBuilder<Fn, Mod<P, {default: [RtSql]}>, D, B, N>;
  default<const V extends D>(value: V): PgIntColumnBuilder<Fn, Mod<P, {default: [Writable<V>]}>, D, B, N>;
  $default(fn: () => D | RtSql): PgIntColumnBuilder<Fn, Mod<P, {$default: true}>, D, B, N>;
  $defaultFn(fn: () => D | RtSql): PgIntColumnBuilder<Fn, Mod<P, {$defaultFn: true}>, D, B, N>;
  $onUpdate(fn: () => D | RtSql): PgIntColumnBuilder<Fn, Mod<P, {$onUpdate: true}>, D, B, N>;
  $onUpdateFn(fn: () => D | RtSql): PgIntColumnBuilder<Fn, Mod<P, {$onUpdateFn: true}>, D, B, N>;
  primaryKey(): PgIntColumnBuilder<Fn, Mod<P, {primaryKey: true}>, D, B, N>;
  unique(): PgIntColumnBuilder<Fn, Mod<P, {unique: true}>, D, B, N>;
  unique<const Name extends string>(name: Name): PgIntColumnBuilder<Fn, Mod<P, {unique: [Name]}>, D, B, N>;
  unique<const Name extends string, const C extends UniqueConfig>(
    name: Name,
    config: C
  ): PgIntColumnBuilder<Fn, Mod<P, {unique: [Name, Writable<C>]}>, D, B, N>;
  references<R extends AnyOwner>(ref: () => R): PgIntColumnBuilder<Fn, Mod<P, {references: [RefOf<R>]}>, D, B, N>;
  references<R extends AnyOwner, const A extends ReferenceActions>(
    ref: () => R,
    actions: A
  ): PgIntColumnBuilder<Fn, Mod<P, {references: [RefOf<R>, Writable<A>]}>, D, B, N>;
  generatedAlwaysAs(as: RtSql | (() => RtSql)): PgIntColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [RtSql]}>, D, B, N>;
  generatedAlwaysAs<const V extends D>(as: V): PgIntColumnBuilder<Fn, Mod<P, {generatedAlwaysAs: [Writable<V>]}>, D, B, N>;
  array(): PgColumnBuilder<Fn, Mod<P, {array: true}>, D, B, N>;
  array<const S extends number>(size: S): PgColumnBuilder<Fn, Mod<P, {array: [S]}>, D, B, N>;
  $type<T>(): PgIntColumnBuilder<Fn, Mod<P, {$type: [T]}>, D, B, N>;
  generatedAlwaysAsIdentity(): PgIntColumnBuilder<Fn, Mod<P, {generatedAlwaysAsIdentity: true}>, D, B, N>;
  generatedAlwaysAsIdentity<const S extends PgIdentityConfig>(
    sequence: S
  ): PgIntColumnBuilder<Fn, Mod<P, {generatedAlwaysAsIdentity: [Writable<S>]}>, D, B, N>;
  generatedByDefaultAsIdentity(): PgIntColumnBuilder<Fn, Mod<P, {generatedByDefaultAsIdentity: true}>, D, B, N>;
  generatedByDefaultAsIdentity<const S extends PgIdentityConfig>(
    sequence: S
  ): PgIntColumnBuilder<Fn, Mod<P, {generatedByDefaultAsIdentity: [Writable<S>]}>, D, B, N>;
}

// ── Builder plumbing ─────────────────────────────────────────────────────────

function pgColumn(fnName: string, args: unknown[]): never {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[]))) as never;
}

// ── Hand-written aliases + builders ──────────────────────────────────────────

export type Bigint<P extends PgBigIntConfig & PgIntColMods = PgBigIntConfig<'number'>> = Column<'bigint', P, BigintData<P>>;
export function bigint<const C extends PgBigIntConfig>(
  config: C
): PgIntColumnBuilder<'bigint', Writable<C>, BigintData<C>, never, undefined>;
export function bigint<N extends string, const C extends PgBigIntConfig>(
  name: N,
  config: C
): PgIntColumnBuilder<'bigint', Writable<C>, BigintData<C>, never, N>;
export function bigint(...args: unknown[]) {
  return pgColumn('bigint', args);
}

export type Bigserial<P extends PgBigIntConfig & PgColMods = PgBigIntConfig<'number'>> = Column<
  'bigserial',
  P,
  BigintData<P>,
  'notNull' | 'hasDefault'
>;
export function bigserial<const C extends PgBigIntConfig>(
  config: C
): PgColumnBuilder<'bigserial', Writable<C>, BigintData<C>, 'notNull' | 'hasDefault', undefined>;
export function bigserial<N extends string, const C extends PgBigIntConfig>(
  name: N,
  config: C
): PgColumnBuilder<'bigserial', Writable<C>, BigintData<C>, 'notNull' | 'hasDefault', N>;
export function bigserial(...args: unknown[]) {
  return pgColumn('bigserial', args);
}

export type Bit<P extends Partial<PgBitConfig> & PgColMods = NoProps> = Column<'bit', P, BitData<P>>;
export function bit<const C extends PgBitConfig>(config: C): PgColumnBuilder<'bit', Writable<C>, BitData<C>, never, undefined>;
export function bit<N extends string, const C extends PgBitConfig>(
  name: N,
  config: C
): PgColumnBuilder<'bit', Writable<C>, BitData<C>, never, N>;
export function bit(...args: unknown[]) {
  return pgColumn('bit', args);
}

export type Boolean<P extends PgColMods = NoProps> = Column<'boolean', P, boolean>;
export function boolean(): PgColumnBuilder<'boolean', NoProps, boolean, never, undefined>;
export function boolean<N extends string>(name: N): PgColumnBuilder<'boolean', NoProps, boolean, never, N>;
export function boolean(...args: unknown[]) {
  return pgColumn('boolean', args);
}

export type Char<P extends PgCharConfig & PgColMods = NoProps> = Column<'char', P, CharData<P>>;
export function char(): PgColumnBuilder<'char', NoProps, Str, never, undefined>;
export function char<const C extends PgCharConfig>(
  config: C
): PgColumnBuilder<'char', Writable<C>, CharData<C>, never, undefined>;
export function char<N extends string>(name: N): PgColumnBuilder<'char', NoProps, Str, never, N>;
export function char<N extends string, const C extends PgCharConfig>(
  name: N,
  config: C
): PgColumnBuilder<'char', Writable<C>, CharData<C>, never, N>;
export function char(...args: unknown[]) {
  return pgColumn('char', args);
}

export type Cidr<P extends PgColMods = NoProps> = Column<'cidr', P, string>;
export function cidr(): PgColumnBuilder<'cidr', NoProps, string, never, undefined>;
export function cidr<N extends string>(name: N): PgColumnBuilder<'cidr', NoProps, string, never, N>;
export function cidr(...args: unknown[]) {
  return pgColumn('cidr', args);
}

export type PgDate<P extends PgDateConfig & PgDateColMods = NoProps> = Column<'date', P, PgDateData<P>>;
export function date(): PgDateColumnBuilder<'date', NoProps, StringDate, never, undefined>;
export function date<const C extends PgDateConfig>(
  config: C
): PgDateColumnBuilder<'date', Writable<C>, PgDateData<C>, never, undefined>;
export function date<N extends string>(name: N): PgDateColumnBuilder<'date', NoProps, StringDate, never, N>;
export function date<N extends string, const C extends PgDateConfig>(
  name: N,
  config: C
): PgDateColumnBuilder<'date', Writable<C>, PgDateData<C>, never, N>;
export function date(...args: unknown[]) {
  return pgColumn('date', args);
}

export type Numeric<P extends PgNumericConfig & PgColMods = NoProps> = Column<'numeric', P, NumericData<P>>;
export function numeric(): PgColumnBuilder<'numeric', NoProps, string, never, undefined>;
export function numeric<const C extends PgNumericConfig>(
  config: C
): PgColumnBuilder<'numeric', Writable<C>, NumericData<C>, never, undefined>;
export function numeric<N extends string>(name: N): PgColumnBuilder<'numeric', NoProps, string, never, N>;
export function numeric<N extends string, const C extends PgNumericConfig>(
  name: N,
  config: C
): PgColumnBuilder<'numeric', Writable<C>, NumericData<C>, never, N>;
export function numeric(...args: unknown[]) {
  return pgColumn('numeric', args);
}

export type Decimal<P extends PgNumericConfig & PgColMods = NoProps> = Column<'decimal', P, NumericData<P>>;
export function decimal(): PgColumnBuilder<'decimal', NoProps, string, never, undefined>;
export function decimal<const C extends PgNumericConfig>(
  config: C
): PgColumnBuilder<'decimal', Writable<C>, NumericData<C>, never, undefined>;
export function decimal<N extends string>(name: N): PgColumnBuilder<'decimal', NoProps, string, never, N>;
export function decimal<N extends string, const C extends PgNumericConfig>(
  name: N,
  config: C
): PgColumnBuilder<'decimal', Writable<C>, NumericData<C>, never, N>;
export function decimal(...args: unknown[]) {
  return pgColumn('decimal', args);
}

export type DoublePrecision<P extends PgColMods = NoProps> = Column<'doublePrecision', P, Float>;
export function doublePrecision(): PgColumnBuilder<'doublePrecision', NoProps, Float, never, undefined>;
export function doublePrecision<N extends string>(name: N): PgColumnBuilder<'doublePrecision', NoProps, Float, never, N>;
export function doublePrecision(...args: unknown[]) {
  return pgColumn('doublePrecision', args);
}

export type Geometry<P extends PgGeometryConfig & PgColMods = NoProps> = Column<'geometry', P, GeometryData<P>>;
export function geometry(): PgColumnBuilder<'geometry', NoProps, [number, number], never, undefined>;
export function geometry<const C extends PgGeometryConfig>(
  config: C
): PgColumnBuilder<'geometry', Writable<C>, GeometryData<C>, never, undefined>;
export function geometry<N extends string>(name: N): PgColumnBuilder<'geometry', NoProps, [number, number], never, N>;
export function geometry<N extends string, const C extends PgGeometryConfig>(
  name: N,
  config: C
): PgColumnBuilder<'geometry', Writable<C>, GeometryData<C>, never, N>;
export function geometry(...args: unknown[]) {
  return pgColumn('geometry', args);
}

export type Halfvec<P extends Partial<PgVectorConfig> & PgColMods = NoProps> = Column<'halfvec', P, number[]>;
export function halfvec<const C extends PgVectorConfig>(
  config: C
): PgColumnBuilder<'halfvec', Writable<C>, number[], never, undefined>;
export function halfvec<N extends string, const C extends PgVectorConfig>(
  name: N,
  config: C
): PgColumnBuilder<'halfvec', Writable<C>, number[], never, N>;
export function halfvec(...args: unknown[]) {
  return pgColumn('halfvec', args);
}

export type Inet<P extends PgColMods = NoProps> = Column<'inet', P, IP>;
export function inet(): PgColumnBuilder<'inet', NoProps, IP, never, undefined>;
export function inet<N extends string>(name: N): PgColumnBuilder<'inet', NoProps, IP, never, N>;
export function inet(...args: unknown[]) {
  return pgColumn('inet', args);
}

export type Integer<P extends PgIntColMods = NoProps> = Column<'integer', P, Int32>;
export function integer(): PgIntColumnBuilder<'integer', NoProps, Int32, never, undefined>;
export function integer<N extends string>(name: N): PgIntColumnBuilder<'integer', NoProps, Int32, never, N>;
export function integer(...args: unknown[]) {
  return pgColumn('integer', args);
}

export type Interval<P extends IntervalConfig & PgColMods = NoProps> = Column<'interval', P, string>;
export function interval(): PgColumnBuilder<'interval', NoProps, string, never, undefined>;
export function interval<const C extends IntervalConfig>(
  config: C
): PgColumnBuilder<'interval', Writable<C>, string, never, undefined>;
export function interval<N extends string>(name: N): PgColumnBuilder<'interval', NoProps, string, never, N>;
export function interval<N extends string, const C extends IntervalConfig>(
  name: N,
  config: C
): PgColumnBuilder<'interval', Writable<C>, string, never, N>;
export function interval(...args: unknown[]) {
  return pgColumn('interval', args);
}

export type Json<P extends PgColMods = NoProps> = Column<'json', P, unknown>;
export function json(): PgColumnBuilder<'json', NoProps, unknown, never, undefined>;
export function json<N extends string>(name: N): PgColumnBuilder<'json', NoProps, unknown, never, N>;
export function json(...args: unknown[]) {
  return pgColumn('json', args);
}

export type Jsonb<P extends PgColMods = NoProps> = Column<'jsonb', P, unknown>;
export function jsonb(): PgColumnBuilder<'jsonb', NoProps, unknown, never, undefined>;
export function jsonb<N extends string>(name: N): PgColumnBuilder<'jsonb', NoProps, unknown, never, N>;
export function jsonb(...args: unknown[]) {
  return pgColumn('jsonb', args);
}

export type Line<P extends PgLineConfig & PgColMods = NoProps> = Column<'line', P, LineData<P>>;
export function line(): PgColumnBuilder<'line', NoProps, [number, number, number], never, undefined>;
export function line<const C extends PgLineConfig>(
  config: C
): PgColumnBuilder<'line', Writable<C>, LineData<C>, never, undefined>;
export function line<N extends string>(name: N): PgColumnBuilder<'line', NoProps, [number, number, number], never, N>;
export function line<N extends string, const C extends PgLineConfig>(
  name: N,
  config: C
): PgColumnBuilder<'line', Writable<C>, LineData<C>, never, N>;
export function line(...args: unknown[]) {
  return pgColumn('line', args);
}

export type Macaddr<P extends PgColMods = NoProps> = Column<'macaddr', P, string>;
export function macaddr(): PgColumnBuilder<'macaddr', NoProps, string, never, undefined>;
export function macaddr<N extends string>(name: N): PgColumnBuilder<'macaddr', NoProps, string, never, N>;
export function macaddr(...args: unknown[]) {
  return pgColumn('macaddr', args);
}

export type Macaddr8<P extends PgColMods = NoProps> = Column<'macaddr8', P, string>;
export function macaddr8(): PgColumnBuilder<'macaddr8', NoProps, string, never, undefined>;
export function macaddr8<N extends string>(name: N): PgColumnBuilder<'macaddr8', NoProps, string, never, N>;
export function macaddr8(...args: unknown[]) {
  return pgColumn('macaddr8', args);
}

export type Point<P extends PgPointConfig & PgColMods = NoProps> = Column<'point', P, PointData<P>>;
export function point(): PgColumnBuilder<'point', NoProps, [number, number], never, undefined>;
export function point<const C extends PgPointConfig>(
  config: C
): PgColumnBuilder<'point', Writable<C>, PointData<C>, never, undefined>;
export function point<N extends string>(name: N): PgColumnBuilder<'point', NoProps, [number, number], never, N>;
export function point<N extends string, const C extends PgPointConfig>(
  name: N,
  config: C
): PgColumnBuilder<'point', Writable<C>, PointData<C>, never, N>;
export function point(...args: unknown[]) {
  return pgColumn('point', args);
}

export type Real<P extends PgColMods = NoProps> = Column<'real', P, Float>;
export function real(): PgColumnBuilder<'real', NoProps, Float, never, undefined>;
export function real<N extends string>(name: N): PgColumnBuilder<'real', NoProps, Float, never, N>;
export function real(...args: unknown[]) {
  return pgColumn('real', args);
}

export type Serial<P extends PgColMods = NoProps> = Column<'serial', P, Int32, 'notNull' | 'hasDefault'>;
export function serial(): PgColumnBuilder<'serial', NoProps, Int32, 'notNull' | 'hasDefault', undefined>;
export function serial<N extends string>(name: N): PgColumnBuilder<'serial', NoProps, Int32, 'notNull' | 'hasDefault', N>;
export function serial(...args: unknown[]) {
  return pgColumn('serial', args);
}

export type Smallint<P extends PgIntColMods = NoProps> = Column<'smallint', P, Int16>;
export function smallint(): PgIntColumnBuilder<'smallint', NoProps, Int16, never, undefined>;
export function smallint<N extends string>(name: N): PgIntColumnBuilder<'smallint', NoProps, Int16, never, N>;
export function smallint(...args: unknown[]) {
  return pgColumn('smallint', args);
}

export type Smallserial<P extends PgColMods = NoProps> = Column<'smallserial', P, Int16, 'notNull' | 'hasDefault'>;
export function smallserial(): PgColumnBuilder<'smallserial', NoProps, Int16, 'notNull' | 'hasDefault', undefined>;
export function smallserial<N extends string>(
  name: N
): PgColumnBuilder<'smallserial', NoProps, Int16, 'notNull' | 'hasDefault', N>;
export function smallserial(...args: unknown[]) {
  return pgColumn('smallserial', args);
}

export type Sparsevec<P extends Partial<PgVectorConfig> & PgColMods = NoProps> = Column<'sparsevec', P, string>;
export function sparsevec<const C extends PgVectorConfig>(
  config: C
): PgColumnBuilder<'sparsevec', Writable<C>, string, never, undefined>;
export function sparsevec<N extends string, const C extends PgVectorConfig>(
  name: N,
  config: C
): PgColumnBuilder<'sparsevec', Writable<C>, string, never, N>;
export function sparsevec(...args: unknown[]) {
  return pgColumn('sparsevec', args);
}

export type Text<P extends PgTextConfig & PgColMods = NoProps> = Column<'text', P, TextData<P>>;
export function text(): PgColumnBuilder<'text', NoProps, Str, never, undefined>;
export function text<const C extends PgTextConfig>(
  config: C
): PgColumnBuilder<'text', Writable<C>, TextData<C>, never, undefined>;
export function text<N extends string>(name: N): PgColumnBuilder<'text', NoProps, Str, never, N>;
export function text<N extends string, const C extends PgTextConfig>(
  name: N,
  config: C
): PgColumnBuilder<'text', Writable<C>, TextData<C>, never, N>;
export function text(...args: unknown[]) {
  return pgColumn('text', args);
}

export type Time<P extends TimeConfig & PgDateColMods = NoProps> = Column<'time', P, StringTime>;
export function time(): PgDateColumnBuilder<'time', NoProps, StringTime, never, undefined>;
export function time<const C extends TimeConfig>(
  config: C
): PgDateColumnBuilder<'time', Writable<C>, StringTime, never, undefined>;
export function time<N extends string>(name: N): PgDateColumnBuilder<'time', NoProps, StringTime, never, N>;
export function time<N extends string, const C extends TimeConfig>(
  name: N,
  config: C
): PgDateColumnBuilder<'time', Writable<C>, StringTime, never, N>;
export function time(...args: unknown[]) {
  return pgColumn('time', args);
}

export type Timestamp<P extends PgTimestampConfig & PgDateColMods = NoProps> = Column<'timestamp', P, TimestampData<P>>;
export function timestamp(): PgDateColumnBuilder<'timestamp', NoProps, RTDate, never, undefined>;
export function timestamp<const C extends PgTimestampConfig>(
  config: C
): PgDateColumnBuilder<'timestamp', Writable<C>, TimestampData<C>, never, undefined>;
export function timestamp<N extends string>(name: N): PgDateColumnBuilder<'timestamp', NoProps, RTDate, never, N>;
export function timestamp<N extends string, const C extends PgTimestampConfig>(
  name: N,
  config: C
): PgDateColumnBuilder<'timestamp', Writable<C>, TimestampData<C>, never, N>;
export function timestamp(...args: unknown[]) {
  return pgColumn('timestamp', args);
}

export type Uuid<P extends PgUuidColMods = NoProps> = Column<'uuid', P, UUID>;
export function uuid(): PgUuidColumnBuilder<'uuid', NoProps, UUID, never, undefined>;
export function uuid<N extends string>(name: N): PgUuidColumnBuilder<'uuid', NoProps, UUID, never, N>;
export function uuid(...args: unknown[]) {
  return pgColumn('uuid', args);
}

export type Varchar<P extends PgVarcharConfig & PgColMods = NoProps> = Column<'varchar', P, VarcharData<P>>;
export function varchar(): PgColumnBuilder<'varchar', NoProps, Str, never, undefined>;
export function varchar<const C extends PgVarcharConfig>(
  config: C
): PgColumnBuilder<'varchar', Writable<C>, VarcharData<C>, never, undefined>;
export function varchar<N extends string>(name: N): PgColumnBuilder<'varchar', NoProps, Str, never, N>;
export function varchar<N extends string, const C extends PgVarcharConfig>(
  name: N,
  config: C
): PgColumnBuilder<'varchar', Writable<C>, VarcharData<C>, never, N>;
export function varchar(...args: unknown[]) {
  return pgColumn('varchar', args);
}

export type Vector<P extends Partial<PgVectorConfig> & PgColMods = NoProps> = Column<'vector', P, number[]>;
export function vector<const C extends PgVectorConfig>(
  config: C
): PgColumnBuilder<'vector', Writable<C>, number[], never, undefined>;
export function vector<N extends string, const C extends PgVectorConfig>(
  name: N,
  config: C
): PgColumnBuilder<'vector', Writable<C>, number[], never, N>;
export function vector(...args: unknown[]) {
  return pgColumn('vector', args);
}

// ── Enums and custom types ───────────────────────────────────────────────────
// No type road: their runtime needs the enum handle or the customType callbacks, so tableFromType
// refuses them. The column types exist so the models work.

/** A pgEnum column: one shared type per value set. */
export type PgEnumCol<Values extends readonly string[], P extends PgColMods = NoProps> = Column<'enum', P, Values[number]>;
/** A customType column. */
export type CustomCol<Data, P extends PgColMods = NoProps> = Column<'custom', P, Data>;

/** Drizzle's customType, recorded; the caller supplies the model type through T['data']. */
export function customType<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  const custom = new RtValueRecorder('customType', [params]);
  function factory(): PgColumnBuilder<'custom', NoProps, T['data'], never, undefined>;
  function factory(config?: T['config']): PgColumnBuilder<'custom', NoProps, T['data'], never, undefined>;
  function factory<N extends string>(name: N, config?: T['config']): PgColumnBuilder<'custom', NoProps, T['data'], never, N>;
  function factory(...args: unknown[]) {
    return new RtColumnRecorder((context) => {
      const drizzleFactory = custom.toDrizzleValue(context) as (...factoryArgs: unknown[]) => unknown;
      return drizzleFactory(...args);
    }) as never;
  }
  (factory as unknown as Record<symbol, unknown>)[rtValueKey] = custom;
  return factory;
}

/** The record handed to a `pgTable` columns callback. */
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
