/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The sqlite types shared across files: each builder's config and data type, the modifier bags and props interfaces,
// and the table, view and entry types toDrizzle takes.

import type {BigInt as RTBigInt, Date as RTDate, Float, Integer as IntegerFormat, String as Str} from '@mionjs/run-types/formats';
import type {AnyColumn, AnyTableRef, ColMods, ColRef, RtSql, rtColumnKey} from '@mionjs/drizzle-orm';
import type {SqliteTable} from './table.ts';
import type {SqliteView} from './views.ts';

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
/** The modifiers a sqlite column type and a builder's props spell alike. */
export interface SqliteSharedColMods {
  notNull?: true;
  /** `true` mirrors `.primaryKey()`; the config form mirrors `.primaryKey({autoIncrement: true})`, db default included. */
  primaryKey?: true | readonly [SQLitePrimaryKeyConfig];
  default?: readonly [unknown];
  unique?: true | readonly [string];
  generatedAlwaysAs?: readonly [unknown] | readonly [unknown, {mode?: 'virtual' | 'stored'}];
}
/** The modifier calls every sqlite column type accepts. */
export interface SqliteColMods
  extends SqliteSharedColMods, Pick<ColMods, '$default' | '$defaultFn' | '$onUpdate' | '$onUpdateFn'> {
  /** Mutable, as `$type<T>()` returns it, so a readonly tuple is refused; declared, not picked, as that costs less. */
  $type?: [unknown];
  references?: readonly [ColRef] | readonly [ColRef, ReferenceActions];
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

// ── What every builder's props take ──────────────────────────────────────────
// The hand-written bag, with the function-carrying keys taking their runtime shape. sqlite has one builder kind, so one bag.

// Written out, not an Omit of the hand-written bag: every builder call checks against one, and an interface is cheapest.
export interface SqliteColIn extends SqliteSharedColMods {
  $type?: readonly [unknown];
  references?: readonly [() => AnyTableRef] | readonly [() => AnyTableRef, ReferenceActions];
  $default?: readonly [() => unknown];
  $defaultFn?: readonly [() => unknown];
  $onUpdate?: readonly [() => unknown];
  $onUpdateFn?: readonly [() => unknown];
}

// ── Tables, views and entries ────────────────────────────────────────────────

/** What this package's toDrizzle and tableFromType take, so another dialect's table is a compile error. */
export type AnySqliteTable = SqliteTable<string, Record<string, AnyColumn>, readonly object[], object>;
/** What this package's toDrizzle takes for a view. */
export type AnySqliteView = SqliteView<string, Record<string, AnyColumn>, object>;

/** Common brand of every extraConfig entry. */
export interface SqliteEntryBrand {
  readonly [rtColumnKey]?: {rtEntry: true};
}
/** An index with its columns: the options drizzle's IndexBuilder takes. */
export interface RtSqliteIndexEntry extends SqliteEntryBrand {
  where(condition: RtSql): RtSqliteIndexEntry;
}
