/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Single-call pg columns: a builder takes every setting in ONE props object and returns exactly the hand-written
// alias's type. No chained modifiers: chain methods break reflection (the runtype id walks method return types,
// MKR009), and each builder's props bag rejects a modifier its kind lacks.

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
import {RtValueRecorder, rtValueKey} from '../../drizzle-orm/src/recorder.ts';
import type {Column, ColBaseFlag, NamedColumn, NoProps, PropsOf} from '../../drizzle-orm/next/columns.ts';
import type {AnyTableRef} from '../../drizzle-orm/next/table.ts';
import {recordColumn} from '../../drizzle-orm/next/recorder.ts';
import type {
  BigintData,
  BitData,
  CharData,
  CustomTypeParams,
  CustomTypeValues,
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
} from '../src/columns.ts';

// ── What each builder kind's props take ──────────────────────────────────────
// The hand-written bags, with the function-carrying keys taking their runtime shape.

// Written out, not an Omit of the hand-written bag: every builder call checks against one, and an interface is cheapest.
export interface PgColIn {
  notNull?: true;
  primaryKey?: true;
  default?: readonly [unknown];
  unique?: true | readonly [string] | readonly [string, {nulls: 'distinct' | 'not distinct'}];
  generatedAlwaysAs?: readonly [unknown];
  array?: true | readonly [number];
  $type?: readonly [unknown];
  references?: readonly [() => AnyTableRef] | readonly [() => AnyTableRef, ReferenceActions];
  $default?: readonly [() => unknown];
  $defaultFn?: readonly [() => unknown];
  $onUpdate?: readonly [() => unknown];
  $onUpdateFn?: readonly [() => unknown];
}
export interface PgDateIn extends PgColIn {
  defaultNow?: true;
}
export interface PgUuidIn extends PgColIn {
  defaultRandom?: true;
}
export interface PgIntIn extends PgColIn {
  generatedAlwaysAsIdentity?: true | readonly [PgIdentityConfig];
  generatedByDefaultAsIdentity?: true | readonly [PgIdentityConfig];
}

/** What a nameless builder returns; a named call wraps it in NamedColumn. */
type Built<Fn extends string, C, D, B extends ColBaseFlag = never> = Column<Fn, PropsOf<C>, D, B>;

function pgColumn(fnName: string, args: unknown[]): never {
  return recordColumn(args, (context, callArgs) => context.ns[fnName](...(callArgs as never[]))) as never;
}

// ── Hand-written aliases + builders ──────────────────────────────────────────

export type Bigint<P extends PgBigIntConfig & PgIntColMods = PgBigIntConfig<'number'>> = Column<'bigint', P, BigintData<P>>;
export function bigint<const C extends PgBigIntConfig & PgIntIn>(props: C): Built<'bigint', C, BigintData<C>>;
export function bigint<N extends string, const C extends PgBigIntConfig & PgIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'bigint', C, BigintData<C>>>;
export function bigint(...args: unknown[]) {
  return pgColumn('bigint', args);
}

export type Bigserial<P extends PgBigIntConfig & PgColMods = PgBigIntConfig<'number'>> = Column<
  'bigserial',
  P,
  BigintData<P>,
  'notNull' | 'hasDefault'
>;
export function bigserial<const C extends PgBigIntConfig & PgColIn>(
  props: C
): Built<'bigserial', C, BigintData<C>, 'notNull' | 'hasDefault'>;
export function bigserial<N extends string, const C extends PgBigIntConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'bigserial', C, BigintData<C>, 'notNull' | 'hasDefault'>>;
export function bigserial(...args: unknown[]) {
  return pgColumn('bigserial', args);
}

export type Bit<P extends Partial<PgBitConfig> & PgColMods = NoProps> = Column<'bit', P, BitData<P>>;
export function bit<const C extends PgBitConfig & PgColIn>(props: C): Built<'bit', C, BitData<C>>;
export function bit<N extends string, const C extends PgBitConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'bit', C, BitData<C>>>;
export function bit(...args: unknown[]) {
  return pgColumn('bit', args);
}

export type Boolean<P extends PgColMods = NoProps> = Column<'boolean', P, boolean>;
export function boolean(): Column<'boolean', NoProps, boolean>;
export function boolean<const C extends PgColIn>(props: C): Built<'boolean', C, boolean>;
export function boolean<N extends string>(name: N): NamedColumn<N, Column<'boolean', NoProps, boolean>>;
export function boolean<N extends string, const C extends PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'boolean', C, boolean>>;
export function boolean(...args: unknown[]) {
  return pgColumn('boolean', args);
}

export type Char<P extends PgCharConfig & PgColMods = NoProps> = Column<'char', P, CharData<P>>;
export function char(): Column<'char', NoProps, Str>;
export function char<const C extends PgCharConfig & PgColIn>(props: C): Built<'char', C, CharData<C>>;
export function char<N extends string>(name: N): NamedColumn<N, Column<'char', NoProps, Str>>;
export function char<N extends string, const C extends PgCharConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'char', C, CharData<C>>>;
export function char(...args: unknown[]) {
  return pgColumn('char', args);
}

export type Cidr<P extends PgColMods = NoProps> = Column<'cidr', P, string>;
export function cidr(): Column<'cidr', NoProps, string>;
export function cidr<const C extends PgColIn>(props: C): Built<'cidr', C, string>;
export function cidr<N extends string>(name: N): NamedColumn<N, Column<'cidr', NoProps, string>>;
export function cidr<N extends string, const C extends PgColIn>(name: N, props: C): NamedColumn<N, Built<'cidr', C, string>>;
export function cidr(...args: unknown[]) {
  return pgColumn('cidr', args);
}

export type PgDate<P extends PgDateConfig & PgDateColMods = NoProps> = Column<'date', P, PgDateData<P>>;
export function date(): Column<'date', NoProps, StringDate>;
export function date<const C extends PgDateConfig & PgDateIn>(props: C): Built<'date', C, PgDateData<C>>;
export function date<N extends string>(name: N): NamedColumn<N, Column<'date', NoProps, StringDate>>;
export function date<N extends string, const C extends PgDateConfig & PgDateIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'date', C, PgDateData<C>>>;
export function date(...args: unknown[]) {
  return pgColumn('date', args);
}

export type Decimal<P extends PgNumericConfig & PgColMods = NoProps> = Column<'decimal', P, NumericData<P>>;
export function decimal(): Column<'decimal', NoProps, string>;
export function decimal<const C extends PgNumericConfig & PgColIn>(props: C): Built<'decimal', C, NumericData<C>>;
export function decimal<N extends string>(name: N): NamedColumn<N, Column<'decimal', NoProps, string>>;
export function decimal<N extends string, const C extends PgNumericConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'decimal', C, NumericData<C>>>;
export function decimal(...args: unknown[]) {
  return pgColumn('decimal', args);
}

export type DoublePrecision<P extends PgColMods = NoProps> = Column<'doublePrecision', P, Float>;
export function doublePrecision(): Column<'doublePrecision', NoProps, Float>;
export function doublePrecision<const C extends PgColIn>(props: C): Built<'doublePrecision', C, Float>;
export function doublePrecision<N extends string>(name: N): NamedColumn<N, Column<'doublePrecision', NoProps, Float>>;
export function doublePrecision<N extends string, const C extends PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'doublePrecision', C, Float>>;
export function doublePrecision(...args: unknown[]) {
  return pgColumn('doublePrecision', args);
}

export type Geometry<P extends PgGeometryConfig & PgColMods = NoProps> = Column<'geometry', P, GeometryData<P>>;
export function geometry(): Column<'geometry', NoProps, [number, number]>;
export function geometry<const C extends PgGeometryConfig & PgColIn>(props: C): Built<'geometry', C, GeometryData<C>>;
export function geometry<N extends string>(name: N): NamedColumn<N, Column<'geometry', NoProps, [number, number]>>;
export function geometry<N extends string, const C extends PgGeometryConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'geometry', C, GeometryData<C>>>;
export function geometry(...args: unknown[]) {
  return pgColumn('geometry', args);
}

export type Halfvec<P extends Partial<PgVectorConfig> & PgColMods = NoProps> = Column<'halfvec', P, number[]>;
export function halfvec<const C extends PgVectorConfig & PgColIn>(props: C): Built<'halfvec', C, number[]>;
export function halfvec<N extends string, const C extends PgVectorConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'halfvec', C, number[]>>;
export function halfvec(...args: unknown[]) {
  return pgColumn('halfvec', args);
}

export type Inet<P extends PgColMods = NoProps> = Column<'inet', P, IP>;
export function inet(): Column<'inet', NoProps, IP>;
export function inet<const C extends PgColIn>(props: C): Built<'inet', C, IP>;
export function inet<N extends string>(name: N): NamedColumn<N, Column<'inet', NoProps, IP>>;
export function inet<N extends string, const C extends PgColIn>(name: N, props: C): NamedColumn<N, Built<'inet', C, IP>>;
export function inet(...args: unknown[]) {
  return pgColumn('inet', args);
}

export type Integer<P extends PgIntColMods = NoProps> = Column<'integer', P, Int32>;
export function integer(): Column<'integer', NoProps, Int32>;
export function integer<const C extends PgIntIn>(props: C): Built<'integer', C, Int32>;
export function integer<N extends string>(name: N): NamedColumn<N, Column<'integer', NoProps, Int32>>;
export function integer<N extends string, const C extends PgIntIn>(name: N, props: C): NamedColumn<N, Built<'integer', C, Int32>>;
export function integer(...args: unknown[]) {
  return pgColumn('integer', args);
}

export type Interval<P extends IntervalConfig & PgColMods = NoProps> = Column<'interval', P, string>;
export function interval(): Column<'interval', NoProps, string>;
export function interval<const C extends IntervalConfig & PgColIn>(props: C): Built<'interval', C, string>;
export function interval<N extends string>(name: N): NamedColumn<N, Column<'interval', NoProps, string>>;
export function interval<N extends string, const C extends IntervalConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'interval', C, string>>;
export function interval(...args: unknown[]) {
  return pgColumn('interval', args);
}

export type Json<P extends PgColMods = NoProps> = Column<'json', P, unknown>;
export function json(): Column<'json', NoProps, unknown>;
export function json<const C extends PgColIn>(props: C): Built<'json', C, unknown>;
export function json<N extends string>(name: N): NamedColumn<N, Column<'json', NoProps, unknown>>;
export function json<N extends string, const C extends PgColIn>(name: N, props: C): NamedColumn<N, Built<'json', C, unknown>>;
export function json(...args: unknown[]) {
  return pgColumn('json', args);
}

export type Jsonb<P extends PgColMods = NoProps> = Column<'jsonb', P, unknown>;
export function jsonb(): Column<'jsonb', NoProps, unknown>;
export function jsonb<const C extends PgColIn>(props: C): Built<'jsonb', C, unknown>;
export function jsonb<N extends string>(name: N): NamedColumn<N, Column<'jsonb', NoProps, unknown>>;
export function jsonb<N extends string, const C extends PgColIn>(name: N, props: C): NamedColumn<N, Built<'jsonb', C, unknown>>;
export function jsonb(...args: unknown[]) {
  return pgColumn('jsonb', args);
}

export type Line<P extends PgLineConfig & PgColMods = NoProps> = Column<'line', P, LineData<P>>;
export function line(): Column<'line', NoProps, [number, number, number]>;
export function line<const C extends PgLineConfig & PgColIn>(props: C): Built<'line', C, LineData<C>>;
export function line<N extends string>(name: N): NamedColumn<N, Column<'line', NoProps, [number, number, number]>>;
export function line<N extends string, const C extends PgLineConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'line', C, LineData<C>>>;
export function line(...args: unknown[]) {
  return pgColumn('line', args);
}

export type Macaddr<P extends PgColMods = NoProps> = Column<'macaddr', P, string>;
export function macaddr(): Column<'macaddr', NoProps, string>;
export function macaddr<const C extends PgColIn>(props: C): Built<'macaddr', C, string>;
export function macaddr<N extends string>(name: N): NamedColumn<N, Column<'macaddr', NoProps, string>>;
export function macaddr<N extends string, const C extends PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'macaddr', C, string>>;
export function macaddr(...args: unknown[]) {
  return pgColumn('macaddr', args);
}

export type Macaddr8<P extends PgColMods = NoProps> = Column<'macaddr8', P, string>;
export function macaddr8(): Column<'macaddr8', NoProps, string>;
export function macaddr8<const C extends PgColIn>(props: C): Built<'macaddr8', C, string>;
export function macaddr8<N extends string>(name: N): NamedColumn<N, Column<'macaddr8', NoProps, string>>;
export function macaddr8<N extends string, const C extends PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'macaddr8', C, string>>;
export function macaddr8(...args: unknown[]) {
  return pgColumn('macaddr8', args);
}

export type Numeric<P extends PgNumericConfig & PgColMods = NoProps> = Column<'numeric', P, NumericData<P>>;
export function numeric(): Column<'numeric', NoProps, string>;
export function numeric<const C extends PgNumericConfig & PgColIn>(props: C): Built<'numeric', C, NumericData<C>>;
export function numeric<N extends string>(name: N): NamedColumn<N, Column<'numeric', NoProps, string>>;
export function numeric<N extends string, const C extends PgNumericConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'numeric', C, NumericData<C>>>;
export function numeric(...args: unknown[]) {
  return pgColumn('numeric', args);
}

export type Point<P extends PgPointConfig & PgColMods = NoProps> = Column<'point', P, PointData<P>>;
export function point(): Column<'point', NoProps, [number, number]>;
export function point<const C extends PgPointConfig & PgColIn>(props: C): Built<'point', C, PointData<C>>;
export function point<N extends string>(name: N): NamedColumn<N, Column<'point', NoProps, [number, number]>>;
export function point<N extends string, const C extends PgPointConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'point', C, PointData<C>>>;
export function point(...args: unknown[]) {
  return pgColumn('point', args);
}

export type Real<P extends PgColMods = NoProps> = Column<'real', P, Float>;
export function real(): Column<'real', NoProps, Float>;
export function real<const C extends PgColIn>(props: C): Built<'real', C, Float>;
export function real<N extends string>(name: N): NamedColumn<N, Column<'real', NoProps, Float>>;
export function real<N extends string, const C extends PgColIn>(name: N, props: C): NamedColumn<N, Built<'real', C, Float>>;
export function real(...args: unknown[]) {
  return pgColumn('real', args);
}

export type Serial<P extends PgColMods = NoProps> = Column<'serial', P, Int32, 'notNull' | 'hasDefault'>;
export function serial(): Column<'serial', NoProps, Int32, 'notNull' | 'hasDefault'>;
export function serial<const C extends PgColIn>(props: C): Built<'serial', C, Int32, 'notNull' | 'hasDefault'>;
export function serial<N extends string>(name: N): NamedColumn<N, Column<'serial', NoProps, Int32, 'notNull' | 'hasDefault'>>;
export function serial<N extends string, const C extends PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'serial', C, Int32, 'notNull' | 'hasDefault'>>;
export function serial(...args: unknown[]) {
  return pgColumn('serial', args);
}

export type Smallint<P extends PgIntColMods = NoProps> = Column<'smallint', P, Int16>;
export function smallint(): Column<'smallint', NoProps, Int16>;
export function smallint<const C extends PgIntIn>(props: C): Built<'smallint', C, Int16>;
export function smallint<N extends string>(name: N): NamedColumn<N, Column<'smallint', NoProps, Int16>>;
export function smallint<N extends string, const C extends PgIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'smallint', C, Int16>>;
export function smallint(...args: unknown[]) {
  return pgColumn('smallint', args);
}

export type Smallserial<P extends PgColMods = NoProps> = Column<'smallserial', P, Int16, 'notNull' | 'hasDefault'>;
export function smallserial(): Column<'smallserial', NoProps, Int16, 'notNull' | 'hasDefault'>;
export function smallserial<const C extends PgColIn>(props: C): Built<'smallserial', C, Int16, 'notNull' | 'hasDefault'>;
export function smallserial<N extends string>(
  name: N
): NamedColumn<N, Column<'smallserial', NoProps, Int16, 'notNull' | 'hasDefault'>>;
export function smallserial<N extends string, const C extends PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'smallserial', C, Int16, 'notNull' | 'hasDefault'>>;
export function smallserial(...args: unknown[]) {
  return pgColumn('smallserial', args);
}

export type Sparsevec<P extends Partial<PgVectorConfig> & PgColMods = NoProps> = Column<'sparsevec', P, string>;
export function sparsevec<const C extends PgVectorConfig & PgColIn>(props: C): Built<'sparsevec', C, string>;
export function sparsevec<N extends string, const C extends PgVectorConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'sparsevec', C, string>>;
export function sparsevec(...args: unknown[]) {
  return pgColumn('sparsevec', args);
}

export type Text<P extends PgTextConfig & PgColMods = NoProps> = Column<'text', P, TextData<P>>;
export function text(): Column<'text', NoProps, Str>;
export function text<const C extends PgTextConfig & PgColIn>(props: C): Built<'text', C, TextData<C>>;
export function text<N extends string>(name: N): NamedColumn<N, Column<'text', NoProps, Str>>;
export function text<N extends string, const C extends PgTextConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'text', C, TextData<C>>>;
export function text(...args: unknown[]) {
  return pgColumn('text', args);
}

export type Time<P extends TimeConfig & PgDateColMods = NoProps> = Column<'time', P, StringTime>;
export function time(): Column<'time', NoProps, StringTime>;
export function time<const C extends TimeConfig & PgDateIn>(props: C): Built<'time', C, StringTime>;
export function time<N extends string>(name: N): NamedColumn<N, Column<'time', NoProps, StringTime>>;
export function time<N extends string, const C extends TimeConfig & PgDateIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'time', C, StringTime>>;
export function time(...args: unknown[]) {
  return pgColumn('time', args);
}

export type Timestamp<P extends PgTimestampConfig & PgDateColMods = NoProps> = Column<'timestamp', P, TimestampData<P>>;
export function timestamp(): Column<'timestamp', NoProps, RTDate>;
export function timestamp<const C extends PgTimestampConfig & PgDateIn>(props: C): Built<'timestamp', C, TimestampData<C>>;
export function timestamp<N extends string>(name: N): NamedColumn<N, Column<'timestamp', NoProps, RTDate>>;
export function timestamp<N extends string, const C extends PgTimestampConfig & PgDateIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'timestamp', C, TimestampData<C>>>;
export function timestamp(...args: unknown[]) {
  return pgColumn('timestamp', args);
}

export type Uuid<P extends PgUuidColMods = NoProps> = Column<'uuid', P, UUID>;
export function uuid(): Column<'uuid', NoProps, UUID>;
export function uuid<const C extends PgUuidIn>(props: C): Built<'uuid', C, UUID>;
export function uuid<N extends string>(name: N): NamedColumn<N, Column<'uuid', NoProps, UUID>>;
export function uuid<N extends string, const C extends PgUuidIn>(name: N, props: C): NamedColumn<N, Built<'uuid', C, UUID>>;
export function uuid(...args: unknown[]) {
  return pgColumn('uuid', args);
}

export type Varchar<P extends PgVarcharConfig & PgColMods = NoProps> = Column<'varchar', P, VarcharData<P>>;
export function varchar(): Column<'varchar', NoProps, Str>;
export function varchar<const C extends PgVarcharConfig & PgColIn>(props: C): Built<'varchar', C, VarcharData<C>>;
export function varchar<N extends string>(name: N): NamedColumn<N, Column<'varchar', NoProps, Str>>;
export function varchar<N extends string, const C extends PgVarcharConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'varchar', C, VarcharData<C>>>;
export function varchar(...args: unknown[]) {
  return pgColumn('varchar', args);
}

export type Vector<P extends Partial<PgVectorConfig> & PgColMods = NoProps> = Column<'vector', P, number[]>;
export function vector<const C extends PgVectorConfig & PgColIn>(props: C): Built<'vector', C, number[]>;
export function vector<N extends string, const C extends PgVectorConfig & PgColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'vector', C, number[]>>;
export function vector(...args: unknown[]) {
  return pgColumn('vector', args);
}

// ── Enums and custom types ───────────────────────────────────────────────────
// No type road (the runtime needs the enum handle or customType callbacks); the types exist for the models.

/** A pgEnum column: one shared type per value set. */
export type PgEnumCol<Values extends readonly string[], P extends PgColMods = NoProps> = Column<'enum', P, Values[number]>;
/** A customType column. */
export type CustomCol<Data, P extends PgColMods = NoProps> = Column<'custom', P, Data>;

/** Drizzle's customType, recorded; the caller supplies the model type through T['data']. */
export function customType<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  const custom = new RtValueRecorder('customType', [params]);
  function factory(): Column<'custom', NoProps, T['data']>;
  function factory<const C extends PgColIn & T['config']>(props: C): Built<'custom', C, T['data']>;
  function factory<N extends string>(name: N): NamedColumn<N, Column<'custom', NoProps, T['data']>>;
  function factory<N extends string, const C extends PgColIn & T['config']>(
    name: N,
    props: C
  ): NamedColumn<N, Built<'custom', C, T['data']>>;
  function factory(...args: unknown[]) {
    return recordColumn(args, (context, callArgs) =>
      (custom.toDrizzleValue(context) as (...factoryArgs: unknown[]) => unknown)(...callArgs)
    ) as never;
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
