/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql types shared across files: each builder's config and data type, the modifier bags and props interfaces,
// and the table, view and entry types toDrizzle takes.

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
  String as Str,
  StringDate,
  StringDateTime,
  UInt8,
  UInt16,
  UInt32,
} from '@mionjs/run-types/formats';
import type {AnyColumn, AnyTableRef, ColMods, ColRef, rtColumnKey} from '@mionjs/drizzle-orm';
import type {MysqlTable} from './table.ts';
import type {MysqlView} from './views.ts';

type EnumTuple = readonly [string, ...string[]];
type EnumOr<T extends readonly string[], Fallback> = string extends T[number] ? Fallback : T[number];
export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';
export interface ReferenceActions {
  onDelete?: UpdateDeleteAction;
  onUpdate?: UpdateDeleteAction;
}

/** The modifier calls every mysql column type accepts (base bag; each builder kind adds its own). */
export interface MySqlColMods extends Pick<
  ColMods,
  'notNull' | 'default' | '$type' | '$default' | '$defaultFn' | '$onUpdate' | '$onUpdateFn'
> {
  primaryKey?: true;
  unique?: true | readonly [string];
  references?: readonly [ColRef] | readonly [ColRef, ReferenceActions];
  generatedAlwaysAs?: readonly [unknown] | readonly [unknown, {mode?: 'virtual' | 'stored'}];
}
/** Floats and decimal use this too: mysql allows AUTO_INCREMENT on any numeric column. */
export interface MySqlIntColMods extends MySqlColMods {
  autoincrement?: true;
}
/** timestamp: + defaultNow() and onUpdateNow(). */
export interface MySqlTimestampColMods extends MySqlColMods {
  defaultNow?: true;
  onUpdateNow?: true;
}

export interface MySqlBigIntConfig<Mode extends 'number' | 'bigint' = 'number' | 'bigint'> {
  mode: Mode;
  unsigned?: boolean;
}
export type BigintDataOf<Mode, Unsigned> = Mode extends 'bigint' ? (Unsigned extends true ? BigUInt64 : BigInt64) : IntegerFormat;
export type BigintData<C> = BigintDataOf<
  C extends {mode: infer Mode} ? Mode : 'number',
  C extends {unsigned: true} ? true : false
>;
export interface MySqlBinaryConfig {
  length?: number;
}
export interface MySqlCharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
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
export interface MySqlDateConfig<Mode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: Mode;
}
export type MySqlDateDataOf<Mode> = Mode extends 'string' ? StringDate : RTDate;
export type MySqlDateData<C> = MySqlDateDataOf<C extends {mode: infer Mode} ? Mode : 'date'>;
export interface MySqlDatetimeConfig<Mode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: Mode;
  fsp?: number;
}
export type DatetimeDataOf<Mode> = Mode extends 'string' ? StringDateTime : RTDate;
export type DatetimeData<C> = DatetimeDataOf<C extends {mode: infer Mode} ? Mode : 'date'>;
export interface MySqlDecimalConfig<Mode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: Mode;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export type DecimalDataOf<Mode> = Mode extends 'number' ? FloatFormat : Mode extends 'bigint' ? bigint : string;
export type DecimalData<C> = DecimalDataOf<C extends {mode: infer Mode} ? Mode : 'string'>;
export interface MySqlDoubleConfig {
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export interface MySqlFloatConfig {
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export interface MySqlIntConfig {
  unsigned?: boolean;
}
export type IntDataOf<Unsigned> = Unsigned extends true ? UInt32 : Int32;
export type IntData<C> = IntDataOf<C extends {unsigned: true} ? true : false>;
export interface MySqlTextConfig<T extends readonly string[] = EnumTuple> {
  enum?: T;
}
/** The one data computation the four text builders and their column types go through. */
export type TextDataOf<T extends readonly string[]> = EnumOr<T, Str>;
export type TextData<C> = TextDataOf<C extends {enum: infer E extends readonly string[]} ? E : readonly string[]>;
export type MediumintDataOf<Unsigned> = Unsigned extends true
  ? Num<{integer: true; min: 0; max: 16777215}>
  : Num<{integer: true; min: -8388608; max: 8388607}>;
export type MediumintData<C> = MediumintDataOf<C extends {unsigned: true} ? true : false>;
export interface MySqlRealConfig {
  precision?: number;
  scale?: number;
}
export type SmallintDataOf<Unsigned> = Unsigned extends true ? UInt16 : Int16;
export type SmallintData<C> = SmallintDataOf<C extends {unsigned: true} ? true : false>;
export interface TimeConfig {
  fsp?: number;
}
export interface MySqlTimestampConfig<Mode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: Mode;
  fsp?: number;
}
export type TimestampDataOf<Mode> = Mode extends 'string' ? StringDateTime : RTDate;
export type TimestampData<C> = TimestampDataOf<C extends {mode: infer Mode} ? Mode : 'date'>;
export type TinyintDataOf<Unsigned> = Unsigned extends true ? UInt8 : Int8;
export type TinyintData<C> = TinyintDataOf<C extends {unsigned: true} ? true : false>;
export interface MySqlVarbinaryOptions {
  length: number;
}
export interface MySqlVarCharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length: L;
  enum?: T;
}
/** The varchar data computation both the builders and VarcharData go through. */
export type VarcharDataOf<T extends readonly string[], L> = string extends T[number]
  ? L extends number
    ? Str<{maxLength: L}>
    : Str
  : T[number];
export type VarcharData<C> = VarcharDataOf<
  C extends {enum: infer E extends readonly string[]} ? E : readonly string[],
  C extends {length: infer L extends number} ? L : undefined
>;
/** The 1901-2155 range mysql stores in a YEAR column, shared by both roads. */
export type YearData = Num<{integer: true; min: 1901; max: 2155}>;
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

// ── Tables, views and entries ────────────────────────────────────────────────

/** What this package's toDrizzle and tableFromType take, so another dialect's table is a compile error. */
export type AnyMysqlTable = MysqlTable<string, Record<string, AnyColumn>, readonly object[], object>;
/** What this package's toDrizzle takes for a view. */
export type AnyMysqlView = MysqlView<string, Record<string, AnyColumn>, object>;

/** Common brand of every extraConfig entry. */
export interface MyEntryBrand {
  readonly [rtColumnKey]?: {rtEntry: true};
}
/** An index with its columns: the options drizzle's IndexBuilder takes. */
export interface RtMyIndexEntry extends MyEntryBrand {
  using(method: 'btree' | 'hash'): RtMyIndexEntry;
  algorithm(algorithm: 'default' | 'inplace' | 'copy'): RtMyIndexEntry;
  lock(lock: 'default' | 'none' | 'shared' | 'exclusive'): RtMyIndexEntry;
}
