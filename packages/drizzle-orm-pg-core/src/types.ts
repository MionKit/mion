/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The pg column vocabulary the builders and column types share: each builder's config, the data type it yields,
// and the modifier bags a column type may spell beside its config keys.

import type {
  BigInt64,
  Date as RTDate,
  Float,
  Integer as IntegerFormat,
  String as Str,
  StringDate,
  StringDateTime,
} from '@mionjs/run-types/formats';
import type {ColMods, ColRef} from '@mionjs/drizzle-orm';

type EnumTuple = readonly [string, ...string[]];
/** A wide enum config (plain string[]) carries no literal union: fall back. */
type EnumOr<T extends readonly string[], Fallback> = string extends T[number] ? Fallback : T[number];
export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';
export interface ReferenceActions {
  onDelete?: UpdateDeleteAction;
  onUpdate?: UpdateDeleteAction;
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
/** The modifier calls every pg column type accepts (base bag; each builder kind adds its own). */
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

export interface PgBigIntConfig<Mode extends 'number' | 'bigint' = 'number' | 'bigint'> {
  mode: Mode;
}
export type BigintDataOf<Mode> = Mode extends 'bigint' ? BigInt64 : IntegerFormat;
export type BigintData<C> = BigintDataOf<C extends {mode: infer Mode} ? Mode : 'number'>;
export interface PgBitConfig<D extends number = number> {
  dimensions: D;
}
export type BitDataOf<D> = D extends number ? Str<{length: D}> : Str;
export type BitData<C> = BitDataOf<C extends {dimensions: infer D} ? D : undefined>;
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
export interface PgDateConfig<Mode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: Mode;
}
export type PgDateDataOf<Mode> = Mode extends 'date' ? RTDate : StringDate;
export type PgDateData<C> = PgDateDataOf<C extends {mode: infer Mode} ? Mode : 'string'>;
export interface PgNumericConfig<Mode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: Mode;
  precision?: number;
  scale?: number;
}
export type NumericDataOf<Mode> = Mode extends 'number' ? Float : Mode extends 'bigint' ? bigint : string;
export type NumericData<C> = NumericDataOf<C extends {mode: infer Mode} ? Mode : 'string'>;
export interface PgGeometryConfig<Mode extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
  mode?: Mode;
  type?: string;
  srid?: number;
}
export type GeometryDataOf<Mode> = Mode extends 'xy' ? {x: number; y: number} : [number, number];
export type GeometryData<C> = GeometryDataOf<C extends {mode: infer Mode} ? Mode : 'tuple'>;
export interface PgVectorConfig<D extends number = number> {
  dimensions: D;
}
export interface IntervalConfig {
  fields?: string;
  precision?: number;
}
export interface PgLineConfig<Mode extends 'tuple' | 'abc' = 'tuple' | 'abc'> {
  mode?: Mode;
}
export type LineDataOf<Mode> = Mode extends 'abc' ? {a: number; b: number; c: number} : [number, number, number];
export type LineData<C> = LineDataOf<C extends {mode: infer Mode} ? Mode : 'tuple'>;
export interface PgPointConfig<Mode extends 'tuple' | 'xy' = 'tuple' | 'xy'> {
  mode?: Mode;
}
export type PointDataOf<Mode> = Mode extends 'xy' ? {x: number; y: number} : [number, number];
export type PointData<C> = PointDataOf<C extends {mode: infer Mode} ? Mode : 'tuple'>;
export interface PgTextConfig<T extends readonly string[] = EnumTuple> {
  enum?: T;
}
export type TextDataOf<T extends readonly string[]> = EnumOr<T, Str>;
export type TextData<C> = TextDataOf<C extends {enum: infer E extends readonly string[]} ? E : readonly string[]>;
export interface TimeConfig {
  precision?: number;
  withTimezone?: boolean;
}
export interface PgTimestampConfig<Mode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: Mode;
  precision?: number;
  withTimezone?: boolean;
}
export type TimestampDataOf<Mode> = Mode extends 'string' ? StringDateTime : RTDate;
export type TimestampData<C> = TimestampDataOf<C extends {mode: infer Mode} ? Mode : 'date'>;
export interface PgVarcharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length?: L;
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
