/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite column vocabulary the builders and column types share: each builder's config, the data type it yields,
// and the modifier bags a column type may spell beside its config keys.

import type {BigInt as RTBigInt, Date as RTDate, Float, Integer as IntegerFormat, String as Str} from '@mionjs/run-types/formats';
import type {ColMods, ColRef} from '@mionjs/drizzle-orm';

type EnumTuple = readonly [string, ...string[]];
export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';
export interface ReferenceActions {
  onDelete?: UpdateDeleteAction;
  onUpdate?: UpdateDeleteAction;
}

export interface SQLitePrimaryKeyConfig {
  autoIncrement?: boolean;
  onConflict?: 'rollback' | 'abort' | 'fail' | 'ignore' | 'replace';
}
/** The modifier calls every sqlite column type accepts. */
export interface SqliteColMods extends Pick<
  ColMods,
  'notNull' | 'default' | '$type' | '$default' | '$defaultFn' | '$onUpdate' | '$onUpdateFn'
> {
  /** `true` mirrors `.primaryKey()`; the config form mirrors `.primaryKey({autoIncrement: true})`, db default included. */
  primaryKey?: true | readonly [SQLitePrimaryKeyConfig];
  unique?: true | readonly [string];
  references?: readonly [ColRef] | readonly [ColRef, ReferenceActions];
  generatedAlwaysAs?: readonly [unknown] | readonly [unknown, {mode?: 'virtual' | 'stored'}];
}

export interface BlobConfig<Mode extends 'buffer' | 'json' | 'bigint' = 'buffer' | 'json' | 'bigint'> {
  mode: Mode;
}
export type BlobDataOf<Mode> = Mode extends 'bigint' ? RTBigInt : Mode extends 'json' ? unknown : Buffer;
export type BlobData<C> = BlobDataOf<C extends {mode: infer Mode} ? Mode : 'buffer'>;
export interface IntegerConfig<
  Mode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' = 'number' | 'timestamp' | 'timestamp_ms' | 'boolean',
> {
  mode: Mode;
}
export type IntegerDataOf<Mode> = Mode extends 'timestamp' | 'timestamp_ms'
  ? RTDate
  : Mode extends 'boolean'
    ? boolean
    : IntegerFormat;
export type IntegerData<C> = IntegerDataOf<C extends {mode: infer Mode} ? Mode : 'number'>;
export interface SQLiteNumericConfig<Mode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: Mode;
}
export type NumericDataOf<Mode> = Mode extends 'number' ? Float : Mode extends 'bigint' ? bigint : string;
export type NumericData<C> = NumericDataOf<C extends {mode: infer Mode} ? Mode : 'string'>;
export interface SQLiteTextConfig<
  Mode extends 'text' | 'json' = 'text' | 'json',
  T extends readonly string[] = EnumTuple,
  L extends number | undefined = number | undefined,
> {
  mode?: Mode;
  enum?: T;
  length?: L;
}
/** The text data computation both the builders and TextData go through. */
export type TextDataOf<Mode, T extends readonly string[], L> = Mode extends 'json'
  ? unknown
  : string extends T[number]
    ? L extends number
      ? Str<{maxLength: L}>
      : Str
    : T[number];
export type TextData<C> = TextDataOf<
  C extends {mode: infer Mode} ? Mode : 'text',
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
