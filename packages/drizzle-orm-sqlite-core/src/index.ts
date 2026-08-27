/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The @mionjs/drizzle-orm-sqlite-core root export: the full drizzle-orm/sqlite-core
// surface passes through unchanged, and the column builders below are shadowed
// by wrappers that forward the call verbatim while stamping the builder's data
// type with the matching runtype format (type-only, via drizzle's own $Type
// channel), capturing the caller's literal config params in OUR generics.
// Coverage is gated by manifests/sqlite.manifest.json
// (`pnpm rtx core drizzle-manifest --check`); the mapping rules live in the
// drizzle-proxy-migration skill.
export * from 'drizzle-orm/sqlite-core';
// refineTableType + the model type utilities (InferSelect/InferInsert/InferUpdate
// and the re-exported standard SelectModel/InsertModel/UpdateModel).
export * from './refine.ts';

import {
  blob as drizzleBlob,
  integer as drizzleInteger,
  numeric as drizzleNumeric,
  real as drizzleReal,
  text as drizzleText,
} from 'drizzle-orm/sqlite-core';
import type {
  BlobConfig,
  IntegerConfig,
  SQLiteNumericConfig,
  SQLiteTextConfig,
  SQLiteTextBuilderInitial,
  SQLiteTextJsonBuilderInitial,
} from 'drizzle-orm/sqlite-core';
import type {$Type, ColumnBuilderBase} from 'drizzle-orm/column-builder';
import type {Writable} from 'drizzle-orm/utils';
import type {BigInt as RTBigInt, Date as RTDate, Integer, Float, String as Str} from '@ts-runtypes/core/formats';

// Stamps Format unless the caller passed a literal enum (an enum's exact
// literal-union typing beats any string format, so it stays untouched).
type StampUnlessEnum<Builder extends ColumnBuilderBase, TEnum extends readonly string[], Format> = string extends TEnum[number]
  ? $Type<Builder, Format>
  : Builder;
type VarcharFormat<L> = L extends number ? Str<{maxLength: L}> : Str;
// The runtime forward: every wrapper calls the drizzle builder untouched; the
// format exists only in the overload return types above each implementation.
type AnyCall = (...callArgs: unknown[]) => never;

// blob defaults to json mode; only the bigint mode carries a format (buffer
// and json values have no runtype format to enforce).
export function blob(): ReturnType<typeof drizzleBlob>;
export function blob<TMode extends BlobConfig['mode'] & {}>(
  config?: BlobConfig<TMode>
): [TMode] extends ['bigint'] ? $Type<ReturnType<typeof drizzleBlob<TMode>>, RTBigInt> : ReturnType<typeof drizzleBlob<TMode>>;
export function blob<TName extends string, TMode extends BlobConfig['mode'] & {}>(
  name: TName,
  config?: BlobConfig<TMode>
): [TMode] extends ['bigint']
  ? $Type<ReturnType<typeof drizzleBlob<TName, TMode>>, RTBigInt>
  : ReturnType<typeof drizzleBlob<TName, TMode>>;
export function blob(...args: unknown[]) {
  return (drizzleBlob as AnyCall)(...args);
}

// integer's timestamp modes hydrate JS Dates, boolean mode has no runtype
// format (passthrough), the default number mode is a plain integer.
export function integer(): $Type<ReturnType<typeof drizzleInteger>, Integer>;
export function integer<TMode extends IntegerConfig['mode'] & {}>(
  config?: IntegerConfig<TMode>
): [TMode] extends ['timestamp' | 'timestamp_ms']
  ? $Type<ReturnType<typeof drizzleInteger<TMode>>, RTDate>
  : [TMode] extends ['boolean']
    ? ReturnType<typeof drizzleInteger<TMode>>
    : $Type<ReturnType<typeof drizzleInteger<TMode>>, Integer>;
export function integer<TName extends string, TMode extends IntegerConfig['mode'] & {}>(
  name: TName,
  config?: IntegerConfig<TMode>
): [TMode] extends ['timestamp' | 'timestamp_ms']
  ? $Type<ReturnType<typeof drizzleInteger<TName, TMode>>, RTDate>
  : [TMode] extends ['boolean']
    ? ReturnType<typeof drizzleInteger<TName, TMode>>
    : $Type<ReturnType<typeof drizzleInteger<TName, TMode>>, Integer>;
export function integer(...args: unknown[]) {
  return (drizzleInteger as AnyCall)(...args);
}

export const int = integer;

// numeric defaults to string mode (passthrough); only mode 'number' gains the
// Float stamp, matching the runtime value type.
export function numeric<TMode extends SQLiteNumericConfig['mode'] & {}>(
  config?: SQLiteNumericConfig<TMode>
): [TMode] extends ['number'] ? $Type<ReturnType<typeof drizzleNumeric<TMode>>, Float> : ReturnType<typeof drizzleNumeric<TMode>>;
export function numeric<TName extends string, TMode extends SQLiteNumericConfig['mode'] & {}>(
  name: TName,
  config?: SQLiteNumericConfig<TMode>
): [TMode] extends ['number']
  ? $Type<ReturnType<typeof drizzleNumeric<TName, TMode>>, Float>
  : ReturnType<typeof drizzleNumeric<TName, TMode>>;
export function numeric(...args: unknown[]) {
  return (drizzleNumeric as AnyCall)(...args);
}

export function real(): $Type<ReturnType<typeof drizzleReal>, Float>;
export function real<TName extends string>(name: TName): $Type<ReturnType<typeof drizzleReal<TName>>, Float>;
export function real(...args: unknown[]) {
  return (drizzleReal as AnyCall)(...args);
}

// text's json mode passes through (semantic types via .$type stay the
// caller's escape hatch); text mode captures the length and honors enums.
export function text(): StampUnlessEnum<
  SQLiteTextBuilderInitial<'', [string, ...string[]], undefined>,
  [string, ...string[]],
  Str
>;
export function text<
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined,
  TMode extends 'text' | 'json' = 'text' | 'json',
>(
  config?: SQLiteTextConfig<TMode, T | Writable<T>, L>
): [TMode] extends ['json']
  ? SQLiteTextJsonBuilderInitial<''>
  : StampUnlessEnum<SQLiteTextBuilderInitial<'', Writable<T>, L>, T, VarcharFormat<L>>;
export function text<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined,
  TMode extends 'text' | 'json' = 'text' | 'json',
>(
  name: TName,
  config?: SQLiteTextConfig<TMode, T | Writable<T>, L>
): [TMode] extends ['json']
  ? SQLiteTextJsonBuilderInitial<TName>
  : StampUnlessEnum<SQLiteTextBuilderInitial<TName, Writable<T>, L>, T, VarcharFormat<L>>;
export function text(...args: unknown[]) {
  return (drizzleText as AnyCall)(...args);
}
