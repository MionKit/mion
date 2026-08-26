/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
  SQLiteColumnBuilderBase,
  SQLiteTableWithColumns,
  SQLiteTextBuilderInitial,
  SQLiteTextJsonBuilderInitial,
  SQLiteIntegerBuilderInitial,
  SQLiteRealBuilderInitial,
  SQLiteBooleanBuilderInitial,
  SQLiteTimestampBuilderInitial,
  SQLiteBigIntBuilderInitial,
} from 'drizzle-orm/sqlite-core';
import type {BuildColumns, $Type} from 'drizzle-orm/column-builder';
import type {FormatName, FormatNameOf, FormatParamsOf} from '@ts-runtypes/core';
import {typeFormats} from '@ts-runtypes/core';
import type {MustBeNever} from './common.types.ts';

// ============================================================================
// Helper types for SQLite column builders with column name
// ============================================================================

/** SQLite text column builder with name */
type SqliteTextColumn<K extends string> = SQLiteTextBuilderInitial<K, [string, ...string[]], number | undefined>;
/** SQLite text column builder carrying a literal-union enum */
type SqliteTextEnumColumn<K extends string, T> = SQLiteTextBuilderInitial<K, [T & string, ...(T & string)[]], number | undefined>;
/** SQLite integer column builder with name */
type SqliteIntegerColumn<K extends string> = SQLiteIntegerBuilderInitial<K>;
/** SQLite real column builder with name */
type SqliteRealColumn<K extends string> = SQLiteRealBuilderInitial<K>;
/** SQLite boolean column builder with name (integer mode: boolean) */
type SqliteBooleanColumn<K extends string> = SQLiteBooleanBuilderInitial<K>;
/** SQLite timestamp column builder with name (integer mode: timestamp) */
type SqliteTimestampColumn<K extends string> = SQLiteTimestampBuilderInitial<K>;
/** SQLite bigint column builder with name (blob mode: bigint) */
type SqliteBigIntColumn<K extends string> = SQLiteBigIntBuilderInitial<K>;
/** SQLite json column builder with name (text mode: json) */
type SqliteJsonColumn<K extends string> = SQLiteTextJsonBuilderInitial<K>;

// ============================================================================
// Format → Column Mapping (mirrors the runtime map in mappers/sqlite.mapper.ts)
// ============================================================================

/** Maps every upstream format name to its SQLite column builder type, keyed by the
 *  typeFormats registry so names can never drift. The MustBeNever asserts below make
 *  the map exhaustive: a format added upstream fails this file's compile until mapped.
 *  Temporal columns are typed WITHOUT $Type: the runtime stores ISO strings and the
 *  driver returns strings, never Temporal instances. */
type SqliteFormatColumnMap<K extends string, T> = {
  [typeFormats.email.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.uuid.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.url.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.domain.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.ip.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.date.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.time.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.dateTime.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.stringFormat.name]: $Type<SqliteTextColumn<K>, T>;
  [typeFormats.bigintFormat.name]: $Type<SqliteBigIntColumn<K>, T>;
  [typeFormats.numberFormat.name]: FormatParamsOf<T> extends {integer: true}
    ? $Type<SqliteIntegerColumn<K>, T>
    : $Type<SqliteRealColumn<K>, T>;
  [typeFormats.nativeDate.name]: $Type<SqliteTimestampColumn<K>, T>;
  [typeFormats.temporalInstant.name]: SqliteTextColumn<K>;
  [typeFormats.temporalZonedDateTime.name]: SqliteTextColumn<K>;
  [typeFormats.temporalPlainDate.name]: SqliteTextColumn<K>;
  [typeFormats.temporalPlainTime.name]: SqliteTextColumn<K>;
  [typeFormats.temporalPlainDateTime.name]: SqliteTextColumn<K>;
  [typeFormats.temporalPlainYearMonth.name]: SqliteTextColumn<K>;
  [typeFormats.formattedArray.name]: $Type<SqliteJsonColumn<K>, T>;
  [typeFormats.formattedObject.name]: $Type<SqliteJsonColumn<K>, T>;
};

// Compile-time exhaustiveness: these FAIL to compile when the map drifts from FormatName.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MissingSqliteFormats = MustBeNever<Exclude<FormatName, keyof SqliteFormatColumnMap<string, unknown>>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExtraSqliteFormats = MustBeNever<Exclude<keyof SqliteFormatColumnMap<string, unknown>, FormatName>>;

// ============================================================================
// Primitive → Column Mapping
// ============================================================================

/** Maps primitive type names to their corresponding SQLite column builder types. */
type SqlitePrimitiveColumnMap<K extends string> = {
  string: SqliteTextColumn<K>;
  number: SqliteRealColumn<K>;
  boolean: SqliteBooleanColumn<K>;
  bigint: SqliteBigIntColumn<K>;
};

/** Resolves a primitive TS type to its SQLite column builder via the primitive map. */
type SqlitePrimitiveColumnType<K extends string, T> = T extends string
  ? SqlitePrimitiveColumnMap<K>['string']
  : T extends number
    ? SqlitePrimitiveColumnMap<K>['number']
    : T extends boolean
      ? SqlitePrimitiveColumnMap<K>['boolean']
      : T extends bigint
        ? SqlitePrimitiveColumnMap<K>['bigint']
        : never;

// ============================================================================
// Column Type Mapping
// ============================================================================

/** Maps a TypeScript type to its corresponding SQLite column builder type.
 * Format types are detected via FormatNameOf (the symbol-sentinel key presence idiom)
 * and resolved through SqliteFormatColumnMap; string literal unions become enum-carrying
 * text columns; primitives resolve via SqlitePrimitiveColumnMap. Tuple-wrapped extends
 * ([T] extends [string]) stop literal unions from distributing. */
export type SqliteColumnType<K extends string, T> = [FormatNameOf<T>] extends [never]
  ? [T] extends [string]
    ? string extends T
      ? SqlitePrimitiveColumnMap<K>['string']
      : $Type<SqliteTextEnumColumn<K, T>, T>
    : T extends number | boolean | bigint
      ? SqlitePrimitiveColumnType<K, T>
      : T extends Date
        ? SqliteTimestampColumn<K>
        : T extends any[] | object
          ? $Type<SqliteJsonColumn<K>, T>
          : SQLiteColumnBuilderBase
  : FormatNameOf<T> extends keyof SqliteFormatColumnMap<K, T>
    ? SqliteFormatColumnMap<K, T>[FormatNameOf<T>]
    : SQLiteColumnBuilderBase;

// ============================================================================
// Table Config Type (for tableConfig parameter)
// ============================================================================

/**
 * Maps a TypeScript type T to a partial record of drizzle column builders.
 * Each property key must exist in T, and the value can be any column builder.
 * This allows users to override the default column type with any compatible column.
 *
 * This type is used for the `tableConfig` parameter to allow overriding specific columns
 * (e.g., for primary keys, foreign keys, custom constraints, or different column types).
 */
export type SqliteTableConfig<T> = {
  [K in keyof T as K extends string ? K : never]?: SQLiteColumnBuilderBase;
};

// ============================================================================
// Auto-Generated Columns Type (for return type)
// ============================================================================

/**
 * Maps each property of T to its corresponding SQLite column builder,
 * with the column name properly typed.
 * Required properties get NotNull applied so InferSelectModel returns T (not T | null).
 * Optional properties remain nullable.
 */
export type AutoGeneratedSqliteColumns<T> = {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  [K in keyof T as K extends string ? K : never]-?: {} extends Pick<T, K>
    ? SqliteColumnType<K & string, NonNullable<T[K]>>
    : SqliteColumnType<K & string, T[K]> & {_: {notNull: true}};
};

// ============================================================================
// Result Type
// ============================================================================

/**
 * Result type for drizzleSqliteTable function.
 * Returns a SQLiteTableWithColumns where the columns are built from the auto-generated
 * columns merged with any overrides from tableConfig.
 */
export type DrizzleSqliteTableResult<
  TTableName extends string,
  T,
  TConfig extends SqliteTableConfig<T> = SqliteTableConfig<T>,
> = SQLiteTableWithColumns<{
  name: TTableName;
  schema: undefined;
  columns: BuildColumns<TTableName, AutoGeneratedSqliteColumns<T> & TConfig, 'sqlite'>;
  dialect: 'sqlite';
}>;
