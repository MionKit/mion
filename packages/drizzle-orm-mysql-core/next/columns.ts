/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Single-call mysql columns: a builder takes every setting in ONE props object and returns exactly the hand-written
// alias's type. No chained modifiers: chain methods break reflection (the runtype id walks method return types,
// MKR009), and each builder's props bag rejects a modifier its kind lacks.

import type {
  Date as RTDate,
  Float as FloatFormat,
  Int8,
  Int16,
  Int32,
  PositiveInt,
  String as Str,
  StringTime,
} from '@mionjs/run-types/formats';
import {RtValueRecorder, rtValueKey} from '../../drizzle-orm/src/recorder.ts';
import type {Column, ColBaseFlag, NamedColumn, NoProps, PropsOf} from '../../drizzle-orm/next/columns.ts';
import type {AnyTableRef} from '../../drizzle-orm/next/table.ts';
import {recordColumn} from '../../drizzle-orm/next/recorder.ts';
import {mysqlEnum} from './helpers.ts';
import type {
  BigintData,
  CharData,
  CustomTypeParams,
  CustomTypeValues,
  DatetimeData,
  DecimalData,
  IntData,
  MediumintData,
  MediumintDataOf,
  MySqlBigIntConfig,
  MySqlBinaryConfig,
  MySqlCharConfig,
  MySqlColMods,
  MySqlDateConfig,
  MySqlDateData,
  MySqlDatetimeConfig,
  MySqlDecimalConfig,
  MySqlDoubleConfig,
  MySqlFloatConfig,
  MySqlIntColMods,
  MySqlIntConfig,
  MySqlRealConfig,
  MySqlTextConfig,
  MySqlTimestampColMods,
  MySqlTimestampConfig,
  MySqlVarbinaryOptions,
  MySqlVarCharConfig,
  ReferenceActions,
  SmallintData,
  TextData,
  TimeConfig,
  TimestampData,
  TinyintData,
  VarcharData,
  YearData,
} from '../src/columns.ts';

// ── What each builder kind's props take ──────────────────────────────────────
// The hand-written bags, with the function-carrying keys taking their runtime shape.

// Written out, not an Omit of the hand-written bag: every builder call checks against one, and an interface is cheapest.
export interface MysqlColIn {
  notNull?: true;
  primaryKey?: true;
  default?: readonly [unknown];
  unique?: true | readonly [string];
  generatedAlwaysAs?: readonly [unknown] | readonly [unknown, {mode?: 'virtual' | 'stored'}];
  $type?: readonly [unknown];
  references?: readonly [() => AnyTableRef] | readonly [() => AnyTableRef, ReferenceActions];
  $default?: readonly [() => unknown];
  $defaultFn?: readonly [() => unknown];
  $onUpdate?: readonly [() => unknown];
  $onUpdateFn?: readonly [() => unknown];
}
/** Every numeric kind: mysql allows AUTO_INCREMENT on floats and decimal too. */
export interface MysqlIntIn extends MysqlColIn {
  autoincrement?: true;
}
export interface MysqlTimestampIn extends MysqlColIn {
  defaultNow?: true;
  onUpdateNow?: true;
}

/** What a nameless builder returns; a named call wraps it in NamedColumn. */
type Built<Fn extends string, C, D, B extends ColBaseFlag = never> = Column<Fn, PropsOf<C>, D, B>;

type SerialBase = 'notNull' | 'hasDefault' | 'autoincrement';

function mysqlColumn(fnName: string, args: unknown[]): never {
  return recordColumn(args, (context, callArgs) => context.ns[fnName](...(callArgs as never[]))) as never;
}

// ── Hand-written aliases + builders ──────────────────────────────────────────

export type Bigint<P extends MySqlBigIntConfig & MySqlIntColMods = {mode: 'number'}> = Column<'bigint', P, BigintData<P>>;
export function bigint<const C extends MySqlBigIntConfig & MysqlIntIn>(props: C): Built<'bigint', C, BigintData<C>>;
export function bigint<N extends string, const C extends MySqlBigIntConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'bigint', C, BigintData<C>>>;
export function bigint(...args: unknown[]) {
  return mysqlColumn('bigint', args);
}

export type Binary<P extends MySqlBinaryConfig & MySqlColMods = NoProps> = Column<'binary', P, string>;
export function binary(): Column<'binary', NoProps, string>;
export function binary<const C extends MySqlBinaryConfig & MysqlColIn>(props: C): Built<'binary', C, string>;
export function binary<N extends string>(name: N): NamedColumn<N, Column<'binary', NoProps, string>>;
export function binary<N extends string, const C extends MySqlBinaryConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'binary', C, string>>;
export function binary(...args: unknown[]) {
  return mysqlColumn('binary', args);
}

export type Boolean<P extends MySqlColMods = NoProps> = Column<'boolean', P, boolean>;
export function boolean(): Column<'boolean', NoProps, boolean>;
export function boolean<const C extends MysqlColIn>(props: C): Built<'boolean', C, boolean>;
export function boolean<N extends string>(name: N): NamedColumn<N, Column<'boolean', NoProps, boolean>>;
export function boolean<N extends string, const C extends MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'boolean', C, boolean>>;
export function boolean(...args: unknown[]) {
  return mysqlColumn('boolean', args);
}

export type Char<P extends MySqlCharConfig & MySqlColMods = NoProps> = Column<'char', P, CharData<P>>;
export function char(): Column<'char', NoProps, Str>;
export function char<const C extends MySqlCharConfig & MysqlColIn>(props: C): Built<'char', C, CharData<C>>;
export function char<N extends string>(name: N): NamedColumn<N, Column<'char', NoProps, Str>>;
export function char<N extends string, const C extends MySqlCharConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'char', C, CharData<C>>>;
export function char(...args: unknown[]) {
  return mysqlColumn('char', args);
}

export type MySqlDate<P extends MySqlDateConfig & MySqlColMods = NoProps> = Column<'date', P, MySqlDateData<P>>;
export function date(): Column<'date', NoProps, RTDate>;
export function date<const C extends MySqlDateConfig & MysqlColIn>(props: C): Built<'date', C, MySqlDateData<C>>;
export function date<N extends string>(name: N): NamedColumn<N, Column<'date', NoProps, RTDate>>;
export function date<N extends string, const C extends MySqlDateConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'date', C, MySqlDateData<C>>>;
export function date(...args: unknown[]) {
  return mysqlColumn('date', args);
}

export type Datetime<P extends MySqlDatetimeConfig & MySqlColMods = NoProps> = Column<'datetime', P, DatetimeData<P>>;
export function datetime(): Column<'datetime', NoProps, RTDate>;
export function datetime<const C extends MySqlDatetimeConfig & MysqlColIn>(props: C): Built<'datetime', C, DatetimeData<C>>;
export function datetime<N extends string>(name: N): NamedColumn<N, Column<'datetime', NoProps, RTDate>>;
export function datetime<N extends string, const C extends MySqlDatetimeConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'datetime', C, DatetimeData<C>>>;
export function datetime(...args: unknown[]) {
  return mysqlColumn('datetime', args);
}

export type Decimal<P extends MySqlDecimalConfig & MySqlIntColMods = NoProps> = Column<'decimal', P, DecimalData<P>>;
export function decimal(): Column<'decimal', NoProps, string>;
export function decimal<const C extends MySqlDecimalConfig & MysqlIntIn>(props: C): Built<'decimal', C, DecimalData<C>>;
export function decimal<N extends string>(name: N): NamedColumn<N, Column<'decimal', NoProps, string>>;
export function decimal<N extends string, const C extends MySqlDecimalConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'decimal', C, DecimalData<C>>>;
export function decimal(...args: unknown[]) {
  return mysqlColumn('decimal', args);
}

export type Double<P extends MySqlDoubleConfig & MySqlIntColMods = NoProps> = Column<'double', P, FloatFormat>;
export function double(): Column<'double', NoProps, FloatFormat>;
export function double<const C extends MySqlDoubleConfig & MysqlIntIn>(props: C): Built<'double', C, FloatFormat>;
export function double<N extends string>(name: N): NamedColumn<N, Column<'double', NoProps, FloatFormat>>;
export function double<N extends string, const C extends MySqlDoubleConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'double', C, FloatFormat>>;
export function double(...args: unknown[]) {
  return mysqlColumn('double', args);
}

export type Float<P extends MySqlFloatConfig & MySqlIntColMods = NoProps> = Column<'float', P, FloatFormat>;
export function float(): Column<'float', NoProps, FloatFormat>;
export function float<const C extends MySqlFloatConfig & MysqlIntIn>(props: C): Built<'float', C, FloatFormat>;
export function float<N extends string>(name: N): NamedColumn<N, Column<'float', NoProps, FloatFormat>>;
export function float<N extends string, const C extends MySqlFloatConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'float', C, FloatFormat>>;
export function float(...args: unknown[]) {
  return mysqlColumn('float', args);
}

export type Int<P extends MySqlIntConfig & MySqlIntColMods = NoProps> = Column<'int', P, IntData<P>>;
export function int(): Column<'int', NoProps, Int32>;
export function int<const C extends MySqlIntConfig & MysqlIntIn>(props: C): Built<'int', C, IntData<C>>;
export function int<N extends string>(name: N): NamedColumn<N, Column<'int', NoProps, Int32>>;
export function int<N extends string, const C extends MySqlIntConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'int', C, IntData<C>>>;
export function int(...args: unknown[]) {
  return mysqlColumn('int', args);
}

export type Json<P extends MySqlColMods = NoProps> = Column<'json', P, unknown>;
export function json(): Column<'json', NoProps, unknown>;
export function json<const C extends MysqlColIn>(props: C): Built<'json', C, unknown>;
export function json<N extends string>(name: N): NamedColumn<N, Column<'json', NoProps, unknown>>;
export function json<N extends string, const C extends MysqlColIn>(name: N, props: C): NamedColumn<N, Built<'json', C, unknown>>;
export function json(...args: unknown[]) {
  return mysqlColumn('json', args);
}

export type Longtext<P extends MySqlTextConfig & MySqlColMods = NoProps> = Column<'longtext', P, TextData<P>>;
export function longtext(): Column<'longtext', NoProps, Str>;
export function longtext<const C extends MySqlTextConfig & MysqlColIn>(props: C): Built<'longtext', C, TextData<C>>;
export function longtext<N extends string>(name: N): NamedColumn<N, Column<'longtext', NoProps, Str>>;
export function longtext<N extends string, const C extends MySqlTextConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'longtext', C, TextData<C>>>;
export function longtext(...args: unknown[]) {
  return mysqlColumn('longtext', args);
}

export type Mediumint<P extends MySqlIntConfig & MySqlIntColMods = NoProps> = Column<'mediumint', P, MediumintData<P>>;
export function mediumint(): Column<'mediumint', NoProps, MediumintDataOf<false>>;
export function mediumint<const C extends MySqlIntConfig & MysqlIntIn>(props: C): Built<'mediumint', C, MediumintData<C>>;
export function mediumint<N extends string>(name: N): NamedColumn<N, Column<'mediumint', NoProps, MediumintDataOf<false>>>;
export function mediumint<N extends string, const C extends MySqlIntConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'mediumint', C, MediumintData<C>>>;
export function mediumint(...args: unknown[]) {
  return mysqlColumn('mediumint', args);
}

export type Mediumtext<P extends MySqlTextConfig & MySqlColMods = NoProps> = Column<'mediumtext', P, TextData<P>>;
export function mediumtext(): Column<'mediumtext', NoProps, Str>;
export function mediumtext<const C extends MySqlTextConfig & MysqlColIn>(props: C): Built<'mediumtext', C, TextData<C>>;
export function mediumtext<N extends string>(name: N): NamedColumn<N, Column<'mediumtext', NoProps, Str>>;
export function mediumtext<N extends string, const C extends MySqlTextConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'mediumtext', C, TextData<C>>>;
export function mediumtext(...args: unknown[]) {
  return mysqlColumn('mediumtext', args);
}

export type Real<P extends MySqlRealConfig & MySqlIntColMods = NoProps> = Column<'real', P, FloatFormat>;
export function real(): Column<'real', NoProps, FloatFormat>;
export function real<const C extends MySqlRealConfig & MysqlIntIn>(props: C): Built<'real', C, FloatFormat>;
export function real<N extends string>(name: N): NamedColumn<N, Column<'real', NoProps, FloatFormat>>;
export function real<N extends string, const C extends MySqlRealConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'real', C, FloatFormat>>;
export function real(...args: unknown[]) {
  return mysqlColumn('real', args);
}

/** drizzle's mysql serial is `bigint unsigned auto_increment`, so `$returningId()` returns it before any modifier. */
export type Serial<P extends MySqlIntColMods = NoProps> = Column<'serial', P, PositiveInt, SerialBase>;
export function serial(): Column<'serial', NoProps, PositiveInt, SerialBase>;
export function serial<const C extends MysqlIntIn>(props: C): Built<'serial', C, PositiveInt, SerialBase>;
export function serial<N extends string>(name: N): NamedColumn<N, Column<'serial', NoProps, PositiveInt, SerialBase>>;
export function serial<N extends string, const C extends MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'serial', C, PositiveInt, SerialBase>>;
export function serial(...args: unknown[]) {
  return mysqlColumn('serial', args);
}

export type Smallint<P extends MySqlIntConfig & MySqlIntColMods = NoProps> = Column<'smallint', P, SmallintData<P>>;
export function smallint(): Column<'smallint', NoProps, Int16>;
export function smallint<const C extends MySqlIntConfig & MysqlIntIn>(props: C): Built<'smallint', C, SmallintData<C>>;
export function smallint<N extends string>(name: N): NamedColumn<N, Column<'smallint', NoProps, Int16>>;
export function smallint<N extends string, const C extends MySqlIntConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'smallint', C, SmallintData<C>>>;
export function smallint(...args: unknown[]) {
  return mysqlColumn('smallint', args);
}

export type Text<P extends MySqlTextConfig & MySqlColMods = NoProps> = Column<'text', P, TextData<P>>;
export function text(): Column<'text', NoProps, Str>;
export function text<const C extends MySqlTextConfig & MysqlColIn>(props: C): Built<'text', C, TextData<C>>;
export function text<N extends string>(name: N): NamedColumn<N, Column<'text', NoProps, Str>>;
export function text<N extends string, const C extends MySqlTextConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'text', C, TextData<C>>>;
export function text(...args: unknown[]) {
  return mysqlColumn('text', args);
}

export type Time<P extends TimeConfig & MySqlColMods = NoProps> = Column<'time', P, StringTime>;
export function time(): Column<'time', NoProps, StringTime>;
export function time<const C extends TimeConfig & MysqlColIn>(props: C): Built<'time', C, StringTime>;
export function time<N extends string>(name: N): NamedColumn<N, Column<'time', NoProps, StringTime>>;
export function time<N extends string, const C extends TimeConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'time', C, StringTime>>;
export function time(...args: unknown[]) {
  return mysqlColumn('time', args);
}

export type Timestamp<P extends MySqlTimestampConfig & MySqlTimestampColMods = NoProps> = Column<
  'timestamp',
  P,
  TimestampData<P>
>;
export function timestamp(): Column<'timestamp', NoProps, RTDate>;
export function timestamp<const C extends MySqlTimestampConfig & MysqlTimestampIn>(
  props: C
): Built<'timestamp', C, TimestampData<C>>;
export function timestamp<N extends string>(name: N): NamedColumn<N, Column<'timestamp', NoProps, RTDate>>;
export function timestamp<N extends string, const C extends MySqlTimestampConfig & MysqlTimestampIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'timestamp', C, TimestampData<C>>>;
export function timestamp(...args: unknown[]) {
  return mysqlColumn('timestamp', args);
}

export type Tinyint<P extends MySqlIntConfig & MySqlIntColMods = NoProps> = Column<'tinyint', P, TinyintData<P>>;
export function tinyint(): Column<'tinyint', NoProps, Int8>;
export function tinyint<const C extends MySqlIntConfig & MysqlIntIn>(props: C): Built<'tinyint', C, TinyintData<C>>;
export function tinyint<N extends string>(name: N): NamedColumn<N, Column<'tinyint', NoProps, Int8>>;
export function tinyint<N extends string, const C extends MySqlIntConfig & MysqlIntIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'tinyint', C, TinyintData<C>>>;
export function tinyint(...args: unknown[]) {
  return mysqlColumn('tinyint', args);
}

export type Tinytext<P extends MySqlTextConfig & MySqlColMods = NoProps> = Column<'tinytext', P, TextData<P>>;
export function tinytext(): Column<'tinytext', NoProps, Str>;
export function tinytext<const C extends MySqlTextConfig & MysqlColIn>(props: C): Built<'tinytext', C, TextData<C>>;
export function tinytext<N extends string>(name: N): NamedColumn<N, Column<'tinytext', NoProps, Str>>;
export function tinytext<N extends string, const C extends MySqlTextConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'tinytext', C, TextData<C>>>;
export function tinytext(...args: unknown[]) {
  return mysqlColumn('tinytext', args);
}

export type Varbinary<P extends Partial<MySqlVarbinaryOptions> & MySqlColMods = NoProps> = Column<'varbinary', P, string>;
export function varbinary<const C extends MySqlVarbinaryOptions & MysqlColIn>(props: C): Built<'varbinary', C, string>;
export function varbinary<N extends string, const C extends MySqlVarbinaryOptions & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'varbinary', C, string>>;
export function varbinary(...args: unknown[]) {
  return mysqlColumn('varbinary', args);
}

export type Varchar<P extends Partial<MySqlVarCharConfig> & MySqlColMods = NoProps> = Column<'varchar', P, VarcharData<P>>;
export function varchar<const C extends MySqlVarCharConfig & MysqlColIn>(props: C): Built<'varchar', C, VarcharData<C>>;
export function varchar<N extends string, const C extends MySqlVarCharConfig & MysqlColIn>(
  name: N,
  props: C
): NamedColumn<N, Built<'varchar', C, VarcharData<C>>>;
export function varchar(...args: unknown[]) {
  return mysqlColumn('varchar', args);
}

export type Year<P extends MySqlColMods = NoProps> = Column<'year', P, YearData>;
export function year(): Column<'year', NoProps, YearData>;
export function year<const C extends MysqlColIn>(props: C): Built<'year', C, YearData>;
export function year<N extends string>(name: N): NamedColumn<N, Column<'year', NoProps, YearData>>;
export function year<N extends string, const C extends MysqlColIn>(name: N, props: C): NamedColumn<N, Built<'year', C, YearData>>;
export function year(...args: unknown[]) {
  return mysqlColumn('year', args);
}

// ── Enums and custom types ───────────────────────────────────────────────────
// No type road (the runtime needs the enum values or customType callbacks); the types exist for the models.

/** A mysqlEnum column over a value tuple: one shared type per value set. */
export type MysqlEnumCol<Values extends readonly string[], P extends MySqlColMods = NoProps> = Column<'enum', P, Values[number]>;
/** A mysqlEnum column over an enum object: data is the union of its VALUES. */
export type MysqlEnumObjectCol<E extends Record<string, string>, P extends MySqlColMods = NoProps> = Column<
  'enum',
  P,
  E[keyof E]
>;
/** A customType column. */
export type CustomCol<Data, P extends MySqlColMods = NoProps> = Column<'custom', P, Data>;

/** Drizzle's customType, recorded; the caller supplies the model type through T['data']. */
export function customType<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  const custom = new RtValueRecorder('customType', [params]);
  function factory(): Column<'custom', NoProps, T['data']>;
  function factory<const C extends MysqlColIn & T['config']>(props: C): Built<'custom', C, T['data']>;
  function factory<N extends string>(name: N): NamedColumn<N, Column<'custom', NoProps, T['data']>>;
  function factory<N extends string, const C extends MysqlColIn & T['config']>(
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
export type MysqlColumnHelpers = typeof mysqlColumnHelpers;
