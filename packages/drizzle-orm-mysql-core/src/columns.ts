/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The mysql column builders of @mionjs/drizzle-orm-mysql-core: drizzle
// identical names and call params, slim recorder returns. THREE kind
// interfaces, grouped by drizzle's own method sets:
//   RtMyColumn           the common chain every mysql builder has
//   RtMyIntColumn        + autoincrement()      (int family + serial)
//   RtMyTimestampColumn  + defaultNow() / onUpdateNow()
// Coverage is gated by manifests/mysql.manifest.json; the completeness spec
// diffs the chain methods against drizzle's builder prototypes.
//
// Each builder also exports its COLUMN TYPE (Varchar, Int, Timestamp, ...),
// the pure-types vocabulary: a hand-written row using these names gets exactly
// the types the builders infer, with zero table machinery.

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
  PositiveInt,
  String as Str,
  StringDate,
  StringDateTime,
  StringTime,
  UInt8,
  UInt16,
  UInt32,
} from '@ts-runtypes/core/formats';
import type {
  AnyRtColumn,
  ColConfigArg,
  ColKeyFlags,
  ColNameArg,
  NoKeyFlags,
  RtColType,
  RtColumnBrand,
  RtColumnKeyBrand,
  RtSql,
  SetKeyFlag,
} from '@mionjs/drizzle-orm';
import {RtColumnRecorder, RtValueRecorder, rtValueKey} from '@mionjs/drizzle-orm';

type Writable<T> = {-readonly [K in keyof T]: T[K]};
/** Rejects a tuple, so the enum-OBJECT overloads never shadow the array ones. */
type NonArray<T> = T extends readonly unknown[] ? never : T;
type EnumTuple = readonly [string, ...string[]];
type EnumOr<T extends readonly string[], Fallback> = string extends T[number] ? Fallback : T[number];

export type UpdateDeleteAction = 'cascade' | 'restrict' | 'no action' | 'set null' | 'set default';
export interface ReferenceActions {
  onDelete?: UpdateDeleteAction;
  onUpdate?: UpdateDeleteAction;
}

// ── The three kind interfaces ────────────────────────────────────────────────

export interface RtMyColumn<Data, N extends boolean, H extends boolean, X extends boolean, K extends ColKeyFlags = NoKeyFlags>
  extends RtColumnBrand<Data, N, H, X>, RtColumnKeyBrand<K> {
  notNull(): RtMyColumn<Data, true, H, X, K>;
  default(value: Data | RtSql): RtMyColumn<Data, N, true, X, K>;
  $default(fn: () => Data | RtSql): RtMyColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $defaultFn(fn: () => Data | RtSql): RtMyColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $onUpdate(fn: () => Data | RtSql): RtMyColumn<Data, N, true, X, K>;
  $onUpdateFn(fn: () => Data | RtSql): RtMyColumn<Data, N, true, X, K>;
  primaryKey(): RtMyColumn<Data, true, H, X, SetKeyFlag<K, 'primaryKey'>>;
  unique(name?: string): RtMyColumn<Data, N, H, X, K>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtMyColumn<Data, N, H, X, K>;
  generatedAlwaysAs(as: Data | RtSql | (() => RtSql), config?: {mode?: 'virtual' | 'stored'}): RtMyColumn<Data, N, true, true, K>;
  $type<T>(): RtMyColumn<T, N, H, X, K>;
}

export interface RtMyIntColumn<Data, N extends boolean, H extends boolean, X extends boolean, K extends ColKeyFlags = NoKeyFlags>
  extends RtColumnBrand<Data, N, H, X>, RtColumnKeyBrand<K> {
  notNull(): RtMyIntColumn<Data, true, H, X, K>;
  default(value: Data | RtSql): RtMyIntColumn<Data, N, true, X, K>;
  $default(fn: () => Data | RtSql): RtMyIntColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $defaultFn(fn: () => Data | RtSql): RtMyIntColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $onUpdate(fn: () => Data | RtSql): RtMyIntColumn<Data, N, true, X, K>;
  $onUpdateFn(fn: () => Data | RtSql): RtMyIntColumn<Data, N, true, X, K>;
  autoincrement(): RtMyIntColumn<Data, N, true, X, SetKeyFlag<K, 'autoincrement'>>;
  primaryKey(): RtMyIntColumn<Data, true, H, X, SetKeyFlag<K, 'primaryKey'>>;
  unique(name?: string): RtMyIntColumn<Data, N, H, X, K>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtMyIntColumn<Data, N, H, X, K>;
  generatedAlwaysAs(
    as: Data | RtSql | (() => RtSql),
    config?: {mode?: 'virtual' | 'stored'}
  ): RtMyIntColumn<Data, N, true, true, K>;
  $type<T>(): RtMyIntColumn<T, N, H, X, K>;
}

export interface RtMyTimestampColumn<
  Data,
  N extends boolean,
  H extends boolean,
  X extends boolean,
  K extends ColKeyFlags = NoKeyFlags,
>
  extends RtColumnBrand<Data, N, H, X>, RtColumnKeyBrand<K> {
  notNull(): RtMyTimestampColumn<Data, true, H, X, K>;
  default(value: Data | RtSql): RtMyTimestampColumn<Data, N, true, X, K>;
  $default(fn: () => Data | RtSql): RtMyTimestampColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $defaultFn(fn: () => Data | RtSql): RtMyTimestampColumn<Data, N, true, X, SetKeyFlag<K, 'runtimeDefault'>>;
  $onUpdate(fn: () => Data | RtSql): RtMyTimestampColumn<Data, N, true, X, K>;
  $onUpdateFn(fn: () => Data | RtSql): RtMyTimestampColumn<Data, N, true, X, K>;
  defaultNow(): RtMyTimestampColumn<Data, N, true, X, K>;
  onUpdateNow(): RtMyTimestampColumn<Data, N, true, X, K>;
  primaryKey(): RtMyTimestampColumn<Data, true, H, X, SetKeyFlag<K, 'primaryKey'>>;
  unique(name?: string): RtMyTimestampColumn<Data, N, H, X, K>;
  references(ref: () => AnyRtColumn, actions?: ReferenceActions): RtMyTimestampColumn<Data, N, H, X, K>;
  generatedAlwaysAs(
    as: Data | RtSql | (() => RtSql),
    config?: {mode?: 'virtual' | 'stored'}
  ): RtMyTimestampColumn<Data, N, true, true, K>;
  $type<T>(): RtMyTimestampColumn<T, N, H, X, K>;
}

// ── Internal builder plumbing ────────────────────────────────────────────────

function myColumn(fnName: string, args: unknown[]): never {
  return new RtColumnRecorder((context) => context.ns[fnName](...(args as never[]))) as never;
}

// ── Named types + builders, one block per column function ────────────────────

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
/** Column type twin of `bigint(name?, config)`. */
export type Bigint<
  A extends string | MySqlBigIntConfig | undefined = undefined,
  C extends MySqlBigIntConfig = MySqlBigIntConfig<'number'>,
> = RtColType<'bigint', ColNameArg<A>, ColConfigArg<A, C>, BigintData<ColConfigArg<A, C>>>;
export function bigint<TMode extends 'number' | 'bigint', U extends boolean = false>(
  config: MySqlBigIntConfig<TMode> & {unsigned?: U}
): RtMyIntColumn<BigintDataOf<TMode, U>, false, false, false>;
export function bigint<TName extends string, TMode extends 'number' | 'bigint', U extends boolean = false>(
  name: TName,
  config: MySqlBigIntConfig<TMode> & {unsigned?: U}
): RtMyIntColumn<BigintDataOf<TMode, U>, false, false, false>;
export function bigint(...args: unknown[]) {
  return myColumn('bigint', args);
}

export interface MySqlBinaryConfig {
  length?: number;
}
/** Column type twin of `binary(name?, config?)`. */
export type Binary<
  A extends string | MySqlBinaryConfig | undefined = undefined,
  C extends MySqlBinaryConfig = Record<never, never>,
> = RtColType<'binary', ColNameArg<A>, ColConfigArg<A, C>, string>;
export function binary(): RtMyColumn<string, false, false, false>;
export function binary(config?: MySqlBinaryConfig): RtMyColumn<string, false, false, false>;
export function binary<TName extends string>(name: TName, config?: MySqlBinaryConfig): RtMyColumn<string, false, false, false>;
export function binary(...args: unknown[]) {
  return myColumn('binary', args);
}

/** Column type twin of `boolean(name?)`. */
export type Boolean<Name extends string | undefined = undefined> = RtColType<'boolean', Name, Record<never, never>, boolean>;
export function boolean(): RtMyColumn<boolean, false, false, false>;
export function boolean<TName extends string>(name: TName): RtMyColumn<boolean, false, false, false>;
export function boolean(...args: unknown[]) {
  return myColumn('boolean', args);
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
/** Column type twin of `char(name?, config?)`. */
export type Char<
  A extends string | MySqlCharConfig | undefined = undefined,
  C extends MySqlCharConfig = Record<never, never>,
> = RtColType<'char', ColNameArg<A>, ColConfigArg<A, C>, CharData<ColConfigArg<A, C>>>;
export function char(): RtMyColumn<Str, false, false, false>;
export function char<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config?: MySqlCharConfig<T | Writable<T>, L>
): RtMyColumn<CharDataOf<T, L>, false, false, false>;
export function char<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config?: MySqlCharConfig<T | Writable<T>, L>): RtMyColumn<CharDataOf<T, L>, false, false, false>;
export function char(...args: unknown[]) {
  return myColumn('char', args);
}

export interface MySqlDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
}
export type MySqlDateDataOf<TMode> = TMode extends 'string' ? StringDate : RTDate;
export type MySqlDateData<C> = MySqlDateDataOf<C extends {mode: infer TMode} ? TMode : 'date'>;
/** Column type twin of `date(name?, config?)` (`MySqlDate`: the global-Date
 *  dodge; the index also re-exports it as `Date`). */
export type MySqlDate<
  A extends string | MySqlDateConfig | undefined = undefined,
  C extends MySqlDateConfig = Record<never, never>,
> = RtColType<'date', ColNameArg<A>, ColConfigArg<A, C>, MySqlDateData<ColConfigArg<A, C>>>;
export function date(): RtMyColumn<RTDate, false, false, false>;
export function date<TMode extends 'date' | 'string' = 'date'>(
  config?: MySqlDateConfig<TMode>
): RtMyColumn<MySqlDateDataOf<TMode>, false, false, false>;
export function date<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: MySqlDateConfig<TMode>
): RtMyColumn<MySqlDateDataOf<TMode>, false, false, false>;
export function date(...args: unknown[]) {
  return myColumn('date', args);
}

export interface MySqlDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  fsp?: number;
}
export type DatetimeDataOf<TMode> = TMode extends 'string' ? StringDateTime : RTDate;
export type DatetimeData<C> = DatetimeDataOf<C extends {mode: infer TMode} ? TMode : 'date'>;
/** Column type twin of `datetime(name?, config?)`. */
export type Datetime<
  A extends string | MySqlDatetimeConfig | undefined = undefined,
  C extends MySqlDatetimeConfig = Record<never, never>,
> = RtColType<'datetime', ColNameArg<A>, ColConfigArg<A, C>, DatetimeData<ColConfigArg<A, C>>>;
export function datetime(): RtMyColumn<RTDate, false, false, false>;
export function datetime<TMode extends 'date' | 'string' = 'date'>(
  config?: MySqlDatetimeConfig<TMode>
): RtMyColumn<DatetimeDataOf<TMode>, false, false, false>;
export function datetime<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: MySqlDatetimeConfig<TMode>
): RtMyColumn<DatetimeDataOf<TMode>, false, false, false>;
export function datetime(...args: unknown[]) {
  return myColumn('datetime', args);
}

export interface MySqlDecimalConfig<TMode extends 'number' | 'string' | 'bigint' = 'number' | 'string' | 'bigint'> {
  mode?: TMode;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
export type DecimalDataOf<TMode> = TMode extends 'number' ? FloatFormat : TMode extends 'bigint' ? bigint : string;
export type DecimalData<C> = DecimalDataOf<C extends {mode: infer TMode} ? TMode : 'string'>;
/** Column type twin of `decimal(name?, config?)`. */
export type Decimal<
  A extends string | MySqlDecimalConfig | undefined = undefined,
  C extends MySqlDecimalConfig = Record<never, never>,
> = RtColType<'decimal', ColNameArg<A>, ColConfigArg<A, C>, DecimalData<ColConfigArg<A, C>>>;
export function decimal(): RtMyColumn<string, false, false, false>;
export function decimal<TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  config?: MySqlDecimalConfig<TMode>
): RtMyColumn<DecimalDataOf<TMode>, false, false, false>;
export function decimal<TName extends string, TMode extends 'number' | 'string' | 'bigint' = 'string'>(
  name: TName,
  config?: MySqlDecimalConfig<TMode>
): RtMyColumn<DecimalDataOf<TMode>, false, false, false>;
export function decimal(...args: unknown[]) {
  return myColumn('decimal', args);
}

export interface MySqlDoubleConfig {
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
/** Column type twin of `double(name?, config?)`. */
export type Double<
  A extends string | MySqlDoubleConfig | undefined = undefined,
  C extends MySqlDoubleConfig = Record<never, never>,
> = RtColType<'double', ColNameArg<A>, ColConfigArg<A, C>, FloatFormat>;
export function double(): RtMyColumn<FloatFormat, false, false, false>;
export function double(config?: MySqlDoubleConfig): RtMyColumn<FloatFormat, false, false, false>;
export function double<TName extends string>(
  name: TName,
  config?: MySqlDoubleConfig
): RtMyColumn<FloatFormat, false, false, false>;
export function double(...args: unknown[]) {
  return myColumn('double', args);
}

export interface MySqlFloatConfig {
  precision?: number;
  scale?: number;
  unsigned?: boolean;
}
/** Column type twin of `float(name?, config?)`. */
export type Float<
  A extends string | MySqlFloatConfig | undefined = undefined,
  C extends MySqlFloatConfig = Record<never, never>,
> = RtColType<'float', ColNameArg<A>, ColConfigArg<A, C>, FloatFormat>;
export function float(): RtMyColumn<FloatFormat, false, false, false>;
export function float(config?: MySqlFloatConfig): RtMyColumn<FloatFormat, false, false, false>;
export function float<TName extends string>(name: TName, config?: MySqlFloatConfig): RtMyColumn<FloatFormat, false, false, false>;
export function float(...args: unknown[]) {
  return myColumn('float', args);
}

export interface MySqlIntConfig {
  unsigned?: boolean;
}
export type IntDataOf<Unsigned> = Unsigned extends true ? UInt32 : Int32;
export type IntData<C> = IntDataOf<C extends {unsigned: true} ? true : false>;
/** Column type twin of `int(name?, config?)`; unsigned rides the config. */
export type Int<
  A extends string | MySqlIntConfig | undefined = undefined,
  C extends MySqlIntConfig = Record<never, never>,
> = RtColType<'int', ColNameArg<A>, ColConfigArg<A, C>, IntData<ColConfigArg<A, C>>>;
export function int<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<IntDataOf<U>, false, false, false>;
export function int<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<IntDataOf<U>, false, false, false>;
export function int(...args: unknown[]) {
  return myColumn('int', args);
}

/** Column type twin of `json(name?)`. */
export type Json<Name extends string | undefined = undefined> = RtColType<'json', Name, Record<never, never>, unknown>;
export function json(): RtMyColumn<unknown, false, false, false>;
export function json<TName extends string>(name: TName): RtMyColumn<unknown, false, false, false>;
export function json(...args: unknown[]) {
  return myColumn('json', args);
}

export interface MySqlTextConfig<T extends readonly string[] = EnumTuple> {
  enum?: T;
}
/** Shared data computation of the four text builders: a narrow enum wins,
 *  else plain Str. */
export type TextDataOf<T extends readonly string[]> = EnumOr<T, Str>;
export type TextData<C> = TextDataOf<C extends {enum: infer E extends readonly string[]} ? E : readonly string[]>;
/** Column type twin of `longtext(name?, config?)`. */
export type Longtext<
  A extends string | MySqlTextConfig | undefined = undefined,
  C extends MySqlTextConfig = Record<never, never>,
> = RtColType<'longtext', ColNameArg<A>, ColConfigArg<A, C>, TextData<ColConfigArg<A, C>>>;
export function longtext(): RtMyColumn<Str, false, false, false>;
export function longtext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function longtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function longtext(...args: unknown[]) {
  return myColumn('longtext', args);
}

export type MediumintDataOf<Unsigned> = Unsigned extends true
  ? Num<{integer: true; min: 0; max: 16777215}>
  : Num<{integer: true; min: -8388608; max: 8388607}>;
export type MediumintData<C> = MediumintDataOf<C extends {unsigned: true} ? true : false>;
/** Column type twin of `mediumint(name?, config?)`. */
export type Mediumint<
  A extends string | MySqlIntConfig | undefined = undefined,
  C extends MySqlIntConfig = Record<never, never>,
> = RtColType<'mediumint', ColNameArg<A>, ColConfigArg<A, C>, MediumintData<ColConfigArg<A, C>>>;
export function mediumint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<MediumintDataOf<U>, false, false, false>;
export function mediumint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<MediumintDataOf<U>, false, false, false>;
export function mediumint(...args: unknown[]) {
  return myColumn('mediumint', args);
}

/** Column type twin of `mediumtext(name?, config?)`. */
export type Mediumtext<
  A extends string | MySqlTextConfig | undefined = undefined,
  C extends MySqlTextConfig = Record<never, never>,
> = RtColType<'mediumtext', ColNameArg<A>, ColConfigArg<A, C>, TextData<ColConfigArg<A, C>>>;
export function mediumtext(): RtMyColumn<Str, false, false, false>;
export function mediumtext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function mediumtext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function mediumtext(...args: unknown[]) {
  return myColumn('mediumtext', args);
}

/** mysqlEnum: a column function directly. Four call shapes, drizzle's own: a
 *  values array or name + values, and the same two taking a TS enum OBJECT
 *  (`enum Role {a = 'a'}` — its members, not a tuple, so the array forms do not
 *  accept it). No column type twin: the second arg is a VALUES list, not a
 *  config object, so the type-road replay cannot spell it — mysqlEnum stays
 *  builders-only for now. */
export function mysqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
  values: T | Writable<T>
): RtMyColumn<T[number], false, false, false>;
export function mysqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  values: T | Writable<T>
): RtMyColumn<T[number], false, false, false>;
export function mysqlEnum<E extends Record<string, string>>(enumObj: NonArray<E>): RtMyColumn<E[keyof E], false, false, false>;
export function mysqlEnum<TName extends string, E extends Record<string, string>>(
  name: TName,
  enumObj: NonArray<E>
): RtMyColumn<E[keyof E], false, false, false>;
export function mysqlEnum(...args: unknown[]) {
  return myColumn('mysqlEnum', args);
}

export interface MySqlRealConfig {
  precision?: number;
  scale?: number;
}
/** Column type twin of `real(name?, config?)`. */
export type Real<
  A extends string | MySqlRealConfig | undefined = undefined,
  C extends MySqlRealConfig = Record<never, never>,
> = RtColType<'real', ColNameArg<A>, ColConfigArg<A, C>, FloatFormat>;
export function real(): RtMyColumn<FloatFormat, false, false, false>;
export function real(config?: MySqlRealConfig): RtMyColumn<FloatFormat, false, false, false>;
export function real<TName extends string>(name: TName, config?: MySqlRealConfig): RtMyColumn<FloatFormat, false, false, false>;
export function real(...args: unknown[]) {
  return myColumn('real', args);
}

/** drizzle's mysql `serial` is `bigint unsigned auto_increment`, so a serial
 *  column is auto-incrementing before any modifier runs — which is what makes
 *  `serial('id').primaryKey()` come back from `$returningId()`. */
type SerialKeyFlags = {primaryKey: false; autoincrement: true; runtimeDefault: false; identity: undefined};

/** Column type twin of `serial(name?)`; intrinsically notNull, defaulted and
 *  auto-incrementing (the last one is what `$returningId()` reads). */
export type Serial<Name extends string | undefined = undefined> = RtColType<
  'serial',
  Name,
  Record<never, never>,
  PositiveInt,
  true,
  true,
  false,
  true
>;
export function serial(): RtMyIntColumn<PositiveInt, true, true, false, SerialKeyFlags>;
export function serial<TName extends string>(name: TName): RtMyIntColumn<PositiveInt, true, true, false, SerialKeyFlags>;
export function serial(...args: unknown[]) {
  return myColumn('serial', args);
}

export type SmallintDataOf<Unsigned> = Unsigned extends true ? UInt16 : Int16;
export type SmallintData<C> = SmallintDataOf<C extends {unsigned: true} ? true : false>;
/** Column type twin of `smallint(name?, config?)`. */
export type Smallint<
  A extends string | MySqlIntConfig | undefined = undefined,
  C extends MySqlIntConfig = Record<never, never>,
> = RtColType<'smallint', ColNameArg<A>, ColConfigArg<A, C>, SmallintData<ColConfigArg<A, C>>>;
export function smallint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<SmallintDataOf<U>, false, false, false>;
export function smallint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<SmallintDataOf<U>, false, false, false>;
export function smallint(...args: unknown[]) {
  return myColumn('smallint', args);
}

/** Column type twin of `text(name?, config?)`. */
export type Text<
  A extends string | MySqlTextConfig | undefined = undefined,
  C extends MySqlTextConfig = Record<never, never>,
> = RtColType<'text', ColNameArg<A>, ColConfigArg<A, C>, TextData<ColConfigArg<A, C>>>;
export function text(): RtMyColumn<Str, false, false, false>;
export function text<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function text<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function text(...args: unknown[]) {
  return myColumn('text', args);
}

export interface TimeConfig {
  fsp?: number;
}
/** Column type twin of `time(name?, config?)`. */
export type Time<A extends string | TimeConfig | undefined = undefined, C extends TimeConfig = Record<never, never>> = RtColType<
  'time',
  ColNameArg<A>,
  ColConfigArg<A, C>,
  StringTime
>;
export function time(): RtMyColumn<StringTime, false, false, false>;
export function time(config?: TimeConfig): RtMyColumn<StringTime, false, false, false>;
export function time<TName extends string>(name: TName, config?: TimeConfig): RtMyColumn<StringTime, false, false, false>;
export function time(...args: unknown[]) {
  return myColumn('time', args);
}

export interface MySqlTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
  mode?: TMode;
  fsp?: number;
}
export type TimestampDataOf<TMode> = TMode extends 'string' ? StringDateTime : RTDate;
export type TimestampData<C> = TimestampDataOf<C extends {mode: infer TMode} ? TMode : 'date'>;
/** Column type twin of `timestamp(name?, config?)`. */
export type Timestamp<
  A extends string | MySqlTimestampConfig | undefined = undefined,
  C extends MySqlTimestampConfig = Record<never, never>,
> = RtColType<'timestamp', ColNameArg<A>, ColConfigArg<A, C>, TimestampData<ColConfigArg<A, C>>>;
export function timestamp(): RtMyTimestampColumn<RTDate, false, false, false>;
export function timestamp<TMode extends 'date' | 'string' = 'date'>(
  config?: MySqlTimestampConfig<TMode>
): RtMyTimestampColumn<TimestampDataOf<TMode>, false, false, false>;
export function timestamp<TName extends string, TMode extends 'date' | 'string' = 'date'>(
  name: TName,
  config?: MySqlTimestampConfig<TMode>
): RtMyTimestampColumn<TimestampDataOf<TMode>, false, false, false>;
export function timestamp(...args: unknown[]) {
  return myColumn('timestamp', args);
}

export type TinyintDataOf<Unsigned> = Unsigned extends true ? UInt8 : Int8;
export type TinyintData<C> = TinyintDataOf<C extends {unsigned: true} ? true : false>;
/** Column type twin of `tinyint(name?, config?)`. */
export type Tinyint<
  A extends string | MySqlIntConfig | undefined = undefined,
  C extends MySqlIntConfig = Record<never, never>,
> = RtColType<'tinyint', ColNameArg<A>, ColConfigArg<A, C>, TinyintData<ColConfigArg<A, C>>>;
export function tinyint<U extends boolean = false>(
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<TinyintDataOf<U>, false, false, false>;
export function tinyint<TName extends string, U extends boolean = false>(
  name: TName,
  config?: MySqlIntConfig & {unsigned?: U}
): RtMyIntColumn<TinyintDataOf<U>, false, false, false>;
export function tinyint(...args: unknown[]) {
  return myColumn('tinyint', args);
}

/** Column type twin of `tinytext(name?, config?)`. */
export type Tinytext<
  A extends string | MySqlTextConfig | undefined = undefined,
  C extends MySqlTextConfig = Record<never, never>,
> = RtColType<'tinytext', ColNameArg<A>, ColConfigArg<A, C>, TextData<ColConfigArg<A, C>>>;
export function tinytext(): RtMyColumn<Str, false, false, false>;
export function tinytext<U extends string, T extends Readonly<[U, ...U[]]>>(
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function tinytext<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
  name: TName,
  config?: MySqlTextConfig<T | Writable<T>>
): RtMyColumn<TextDataOf<T>, false, false, false>;
export function tinytext(...args: unknown[]) {
  return myColumn('tinytext', args);
}

export interface MySqlVarbinaryOptions {
  length: number;
}
/** Column type twin of `varbinary(name?, config)`. */
export type Varbinary<
  A extends string | Partial<MySqlVarbinaryOptions> | undefined = undefined,
  C extends Partial<MySqlVarbinaryOptions> = Record<never, never>,
> = RtColType<'varbinary', ColNameArg<A>, ColConfigArg<A, C>, string>;
export function varbinary(config: MySqlVarbinaryOptions): RtMyColumn<string, false, false, false>;
export function varbinary<TName extends string>(
  name: TName,
  config: MySqlVarbinaryOptions
): RtMyColumn<string, false, false, false>;
export function varbinary(...args: unknown[]) {
  return myColumn('varbinary', args);
}

export interface MySqlVarCharConfig<T extends readonly string[] = EnumTuple, L extends number | undefined = number | undefined> {
  length: L;
  enum?: T;
}
/** Shared data computation of varchar, the anti-drift funnel of BOTH roads: a
 *  narrow enum wins, else length caps the string, else plain Str. The builder
 *  overloads call it with their inferred params; the column type extracts the
 *  same params from its config literal (VarcharData). */
export type VarcharDataOf<T extends readonly string[], L> = string extends T[number]
  ? L extends number
    ? Str<{maxLength: L}>
    : Str
  : T[number];
export type VarcharData<C> = VarcharDataOf<
  C extends {enum: infer E extends readonly string[]} ? E : readonly string[],
  C extends {length: infer L extends number} ? L : undefined
>;
/** Column type twin of `varchar(name?, config)`. */
export type Varchar<
  A extends string | Partial<MySqlVarCharConfig> | undefined = undefined,
  C extends Partial<MySqlVarCharConfig> = Record<never, never>,
> = RtColType<'varchar', ColNameArg<A>, ColConfigArg<A, C>, VarcharData<ColConfigArg<A, C>>>;
export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined = undefined>(
  config: MySqlVarCharConfig<T | Writable<T>, L>
): RtMyColumn<VarcharDataOf<T, L>, false, false, false>;
export function varchar<
  TName extends string,
  U extends string,
  T extends Readonly<[U, ...U[]]>,
  L extends number | undefined = undefined,
>(name: TName, config: MySqlVarCharConfig<T | Writable<T>, L>): RtMyColumn<VarcharDataOf<T, L>, false, false, false>;
export function varchar(...args: unknown[]) {
  return myColumn('varchar', args);
}

/** The 1901-2155 range mysql stores in a YEAR column, shared by both roads. */
export type YearData = Num<{integer: true; min: 1901; max: 2155}>;
/** Column type twin of `year(name?)`. */
export type Year<Name extends string | undefined = undefined> = RtColType<'year', Name, Record<never, never>, YearData>;
export function year(): RtMyColumn<YearData, false, false, false>;
export function year<TName extends string>(name: TName): RtMyColumn<YearData, false, false, false>;
export function year(...args: unknown[]) {
  return myColumn('year', args);
}

// ── customType escape hatch ──────────────────────────────────────────────────

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
export function customType<T extends CustomTypeValues>(params: CustomTypeParams<T>) {
  const custom = new RtValueRecorder('customType', [params]);
  function factory(): RtMyColumn<T['data'], false, false, false>;
  function factory(config?: T['config']): RtMyColumn<T['data'], false, false, false>;
  function factory<TName extends string>(name: TName, config?: T['config']): RtMyColumn<T['data'], false, false, false>;
  function factory(...args: unknown[]) {
    return new RtColumnRecorder((context) => {
      const drizzleFactory = custom.toDrizzleValue(context) as (...factoryArgs: unknown[]) => unknown;
      return drizzleFactory(...args);
    }) as never;
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
export type MySqlColumnHelpers = typeof mysqlColumnHelpers;
