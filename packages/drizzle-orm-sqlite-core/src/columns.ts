/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// One props object per builder, typed exactly as the hand-written alias. No chained modifiers: the runtype id walks
// method return types (marker-self-instantiating-generic), and the props bag rejects a modifier sqlite lacks.

import type {Float, Integer as IntegerFormat, String as Str} from '@mionjs/run-types/formats';
import {RtValueRecorder, rtValueKey, recordColumn, recordNsColumn} from '@mionjs/drizzle-orm';
import type {ColBaseFlag, Column, NamedColumn, NoProps, Only, PropsOf} from '@mionjs/drizzle-orm';
import type {
  BlobConfig,
  BlobData,
  CustomTypeParams,
  CustomTypeValues,
  IntegerConfig,
  IntegerData,
  NumericData,
  SqliteColIn,
  SqliteColMods,
  SQLiteNumericConfig,
  SQLiteTextConfig,
  TextData,
} from './types.ts';

/** What a nameless builder returns; a named call wraps it in NamedColumn. */
type Built<Fn extends string, C, D, B extends ColBaseFlag = never> = Column<Fn, PropsOf<C>, D, B>;

// ── Hand-written aliases + builders ──────────────────────────────────────────

export type Blob<P extends Only<P, Partial<BlobConfig> & SqliteColMods> = NoProps> = Column<'blob', P, BlobData<P>>;
export function blob(): Column<'blob', NoProps, Buffer>;
export function blob<N extends string>(name: N): NamedColumn<N, Column<'blob', NoProps, Buffer>>;
export function blob<N extends string, const C extends Only<C, Partial<BlobConfig> & SqliteColIn>>(
  name: N,
  props: C
): NamedColumn<N, Built<'blob', C, BlobData<C>>>;
export function blob<const C extends Only<C, Partial<BlobConfig> & SqliteColIn>>(props: C): Built<'blob', C, BlobData<C>>;
export function blob(...args: unknown[]) {
  return recordNsColumn('blob', args);
}

// integer and int are the rowid when they are the primary key, so drizzle defaults them with or without autoIncrement.
export type Integer<P extends Only<P, Partial<IntegerConfig> & SqliteColMods> = NoProps> = Column<
  'integer',
  P,
  IntegerData<P>,
  'primaryKeyHasDefault'
>;
export function integer(): Column<'integer', NoProps, IntegerFormat, 'primaryKeyHasDefault'>;
export function integer<N extends string>(
  name: N
): NamedColumn<N, Column<'integer', NoProps, IntegerFormat, 'primaryKeyHasDefault'>>;
export function integer<N extends string, const C extends Only<C, Partial<IntegerConfig> & SqliteColIn>>(
  name: N,
  props: C
): NamedColumn<N, Built<'integer', C, IntegerData<C>, 'primaryKeyHasDefault'>>;
export function integer<const C extends Only<C, Partial<IntegerConfig> & SqliteColIn>>(
  props: C
): Built<'integer', C, IntegerData<C>, 'primaryKeyHasDefault'>;
export function integer(...args: unknown[]) {
  return recordNsColumn('integer', args);
}

// Its own alias rather than Integer: the recorded fn is what a converted table prints back, so int() stays int().
export type Int<P extends Only<P, Partial<IntegerConfig> & SqliteColMods> = NoProps> = Column<
  'int',
  P,
  IntegerData<P>,
  'primaryKeyHasDefault'
>;
export function int(): Column<'int', NoProps, IntegerFormat, 'primaryKeyHasDefault'>;
export function int<N extends string>(name: N): NamedColumn<N, Column<'int', NoProps, IntegerFormat, 'primaryKeyHasDefault'>>;
export function int<N extends string, const C extends Only<C, Partial<IntegerConfig> & SqliteColIn>>(
  name: N,
  props: C
): NamedColumn<N, Built<'int', C, IntegerData<C>, 'primaryKeyHasDefault'>>;
export function int<const C extends Only<C, Partial<IntegerConfig> & SqliteColIn>>(
  props: C
): Built<'int', C, IntegerData<C>, 'primaryKeyHasDefault'>;
export function int(...args: unknown[]) {
  return recordNsColumn('int', args);
}

export type Numeric<P extends Only<P, SQLiteNumericConfig & SqliteColMods> = NoProps> = Column<'numeric', P, NumericData<P>>;
export function numeric(): Column<'numeric', NoProps, string>;
export function numeric<N extends string>(name: N): NamedColumn<N, Column<'numeric', NoProps, string>>;
export function numeric<N extends string, const C extends Only<C, SQLiteNumericConfig & SqliteColIn>>(
  name: N,
  props: C
): NamedColumn<N, Built<'numeric', C, NumericData<C>>>;
export function numeric<const C extends Only<C, SQLiteNumericConfig & SqliteColIn>>(
  props: C
): Built<'numeric', C, NumericData<C>>;
export function numeric(...args: unknown[]) {
  return recordNsColumn('numeric', args);
}

export type Real<P extends Only<P, SqliteColMods> = NoProps> = Column<'real', P, Float>;
export function real(): Column<'real', NoProps, Float>;
export function real<N extends string>(name: N): NamedColumn<N, Column<'real', NoProps, Float>>;
export function real<N extends string, const C extends Only<C, SqliteColIn>>(
  name: N,
  props: C
): NamedColumn<N, Built<'real', C, Float>>;
export function real<const C extends Only<C, SqliteColIn>>(props: C): Built<'real', C, Float>;
export function real(...args: unknown[]) {
  return recordNsColumn('real', args);
}

export type Text<P extends Only<P, SQLiteTextConfig & SqliteColMods> = NoProps> = Column<'text', P, TextData<P>>;
export function text(): Column<'text', NoProps, Str>;
export function text<N extends string>(name: N): NamedColumn<N, Column<'text', NoProps, Str>>;
export function text<N extends string, const C extends Only<C, SQLiteTextConfig & SqliteColIn>>(
  name: N,
  props: C
): NamedColumn<N, Built<'text', C, TextData<C>>>;
export function text<const C extends Only<C, SQLiteTextConfig & SqliteColIn>>(props: C): Built<'text', C, TextData<C>>;
export function text(...args: unknown[]) {
  return recordNsColumn('text', args);
}

// ── Custom types ─────────────────────────────────────────────────────────────
// No type road (the runtime needs the customType callbacks); the type exists for the models.

/** A customType column. */
export type CustomCol<Data, P extends Only<P, SqliteColMods> = NoProps> = Column<'custom', P, Data>;

/** Drizzle's customType, recorded; the caller supplies the model type through T['data']. */
export function customType<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  const custom = new RtValueRecorder('customType', [params]);
  function factory(): Column<'custom', NoProps, T['data']>;
  function factory<N extends string>(name: N): NamedColumn<N, Column<'custom', NoProps, T['data']>>;
  function factory<N extends string, const C extends Only<C, SqliteColIn & T['config']>>(
    name: N,
    props: C
  ): NamedColumn<N, Built<'custom', C, T['data']>>;
  function factory<const C extends Only<C, SqliteColIn & T['config']>>(props: C): Built<'custom', C, T['data']>;
  function factory(...args: unknown[]) {
    return recordColumn(args, (context, callArgs) =>
      (custom.toDrizzleValue(context) as (...factoryArgs: unknown[]) => unknown)(...callArgs)
    ) as never;
  }
  (factory as unknown as Record<symbol, unknown>)[rtValueKey] = custom;
  return factory;
}

/** The record handed to a `sqliteTable` columns callback. */
export const sqliteColumnHelpers = {blob, customType, int, integer, numeric, real, text};
export type SqliteColumnHelpers = typeof sqliteColumnHelpers;
