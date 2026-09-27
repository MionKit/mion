/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql column vocabulary the builders and column types share: each builder's config, the data type it yields,
// and the modifier bags a column type may spell beside its config keys.

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
import type {ColMods, ColRef} from '@mionjs/drizzle-orm';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
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

export interface MySqlBigIntConfig<TMode extends 'number' | 'bigint' = 'number' | 'bigint'> {
  mode: TMode;
  unsigned?: boolean;
}
export type BigintDataOf<TMode, Unsigned> = TMode extends 'bigint'
  ? Unsigned extends true
    ? BigUInt64
    : BigInt64
  : IntegerFormat;
export type BigintData<C> = BigintDataOf<
  C extends {mode: infer TMode} ? TMode : 'number',
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
export interface MySqlDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
}
export type MySqlDateDataOf<TMode> = TMode extends 'string' ? StringDate : RTDate;
export type MySqlDateData<C> = MySqlDateDataOf<C extends {mode: infer TMode} ? TMode : 'date'>;
export interface MySqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  fsp?: number;
}
export type DatetimeDataOf<TMode> = TMode extends 'string' ? StringDateTime : RTDate;
export type DatetimeData<C> = DatetimeDataOf<C extends {mode: infer TMode} ? TMode : 'date'>;
export interface MySqlDecimalConfig<TMode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: TMode;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export type DecimalDataOf<TMode> = TMode extends 'number' ? FloatFormat : TMode extends 'bigint' ? bigint : string;
export type DecimalData<C> = DecimalDataOf<C extends {mode: infer TMode} ? TMode : 'string'>;
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
export interface MySqlTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  fsp?: number;
}
export type TimestampDataOf<TMode> = TMode extends 'string' ? StringDateTime : RTDate;
export type TimestampData<C> = TimestampDataOf<C extends {mode: infer TMode} ? TMode : 'date'>;
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
