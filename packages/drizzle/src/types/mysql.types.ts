/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
  MySqlColumnBuilderBase,
  MySqlTableWithColumns,
  MySqlTextBuilderInitial,
  MySqlVarCharBuilderInitial,
  MySqlIntBuilderInitial,
  MySqlDoubleBuilderInitial,
  MySqlBooleanBuilderInitial,
  MySqlBigInt53BuilderInitial,
  MySqlTimestampBuilderInitial,
  MySqlTimestampStringBuilderInitial,
  MySqlDateTimeBuilderInitial,
  MySqlDateTimeStringBuilderInitial,
  MySqlDateBuilderInitial,
  MySqlDateStringBuilderInitial,
  MySqlTimeBuilderInitial,
  MySqlJsonBuilderInitial,
  MySqlEnumColumnBuilderInitial,
} from 'drizzle-orm/mysql-core';
import type {BuildColumns, $Type} from 'drizzle-orm/column-builder';
import type {FormatName, FormatNameOf, FormatParamsOf} from '@ts-runtypes/core';
import {typeFormats} from '@ts-runtypes/core';
import type {MustBeNever} from './common.types.ts';

// ============================================================================
// Helper types for MySQL column builders with column name
// ============================================================================

/** MySQL text column builder with name */
type MySqlTextColumn<K extends string> = MySqlTextBuilderInitial<K, [string, ...string[]]>;
/** MySQL varchar column builder with name */
type MySqlVarcharColumn<K extends string> = MySqlVarCharBuilderInitial<K, [string, ...string[]], number | undefined>;
/** MySQL native enum column builder carrying a literal-union enum */
type MySqlEnumColumn<K extends string, T> = MySqlEnumColumnBuilderInitial<K, [T & string, ...(T & string)[]]>;
/** MySQL int column builder with name */
type MySqlIntColumn<K extends string> = MySqlIntBuilderInitial<K>;
/** MySQL double column builder with name */
type MySqlDoubleColumn<K extends string> = MySqlDoubleBuilderInitial<K>;
/** MySQL boolean column builder with name */
type MySqlBooleanColumn<K extends string> = MySqlBooleanBuilderInitial<K>;
/** MySQL bigint column builder with name */
type MySqlBigIntColumn<K extends string> = MySqlBigInt53BuilderInitial<K>;
/** MySQL timestamp column builder with name */
type MySqlTimestampColumn<K extends string> = MySqlTimestampBuilderInitial<K>;
/** MySQL timestamp column builder in string mode */
type MySqlTimestampStringColumn<K extends string> = MySqlTimestampStringBuilderInitial<K>;
/** MySQL datetime column builder with name */
type MySqlDatetimeColumn<K extends string> = MySqlDateTimeBuilderInitial<K>;
/** MySQL datetime column builder in string mode */
type MySqlDatetimeStringColumn<K extends string> = MySqlDateTimeStringBuilderInitial<K>;
/** MySQL date column builder with name */
type MySqlDateColumn<K extends string> = MySqlDateBuilderInitial<K>;
/** MySQL date column builder in string mode */
type MySqlDateStringColumn<K extends string> = MySqlDateStringBuilderInitial<K>;
/** MySQL time column builder with name */
type MySqlTimeColumn<K extends string> = MySqlTimeBuilderInitial<K>;
/** MySQL json column builder with name */
type MySqlJsonColumn<K extends string> = MySqlJsonBuilderInitial<K>;

// ============================================================================
// Format → Column Mapping (mirrors the runtime map in mappers/mysql.mapper.ts)
// ============================================================================

/** Maps every upstream format name to its MySQL column builder type, keyed by the
 *  typeFormats registry so names can never drift. The MustBeNever asserts below make
 *  the map exhaustive: a format added upstream fails this file's compile until mapped.
 *  Temporal columns are typed WITHOUT $Type: the runtime stores ISO strings and the
 *  driver returns strings, never Temporal instances. */
type MySqlFormatColumnMap<K extends string, T> = {
  [typeFormats.email.name]: $Type<MySqlVarcharColumn<K>, T>;
  [typeFormats.uuid.name]: $Type<MySqlVarcharColumn<K>, T>;
  [typeFormats.url.name]: $Type<MySqlVarcharColumn<K>, T>;
  [typeFormats.domain.name]: $Type<MySqlVarcharColumn<K>, T>;
  [typeFormats.ip.name]: $Type<MySqlVarcharColumn<K>, T>;
  [typeFormats.date.name]: $Type<MySqlDateColumn<K>, T>;
  [typeFormats.time.name]: $Type<MySqlTimeColumn<K>, T>;
  [typeFormats.dateTime.name]: $Type<MySqlDatetimeColumn<K>, T>;
  [typeFormats.stringFormat.name]: $Type<MySqlVarcharColumn<K>, T>;
  [typeFormats.bigintFormat.name]: $Type<MySqlBigIntColumn<K>, T>;
  [typeFormats.numberFormat.name]: FormatParamsOf<T> extends {integer: true}
    ? $Type<MySqlIntColumn<K>, T>
    : $Type<MySqlDoubleColumn<K>, T>;
  [typeFormats.nativeDate.name]: $Type<MySqlTimestampColumn<K>, T>;
  [typeFormats.temporalInstant.name]: MySqlTimestampStringColumn<K>;
  [typeFormats.temporalZonedDateTime.name]: MySqlTextColumn<K>;
  [typeFormats.temporalPlainDate.name]: MySqlDateStringColumn<K>;
  [typeFormats.temporalPlainTime.name]: MySqlTimeColumn<K>;
  [typeFormats.temporalPlainDateTime.name]: MySqlDatetimeStringColumn<K>;
  [typeFormats.temporalPlainYearMonth.name]: MySqlVarcharColumn<K>;
  [typeFormats.formattedArray.name]: $Type<MySqlJsonColumn<K>, T>;
  [typeFormats.formattedObject.name]: $Type<MySqlJsonColumn<K>, T>;
};

// Compile-time exhaustiveness: these FAIL to compile when the map drifts from FormatName.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MissingMySqlFormats = MustBeNever<Exclude<FormatName, keyof MySqlFormatColumnMap<string, unknown>>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExtraMySqlFormats = MustBeNever<Exclude<keyof MySqlFormatColumnMap<string, unknown>, FormatName>>;

// ============================================================================
// Primitive → Column Mapping
// ============================================================================

/** Maps primitive type names to their corresponding MySQL column builder types. */
type MySqlPrimitiveColumnMap<K extends string> = {
  string: MySqlVarcharColumn<K>;
  number: MySqlDoubleColumn<K>;
  boolean: MySqlBooleanColumn<K>;
  bigint: MySqlBigIntColumn<K>;
};

/** Resolves a primitive TS type to its MySQL column builder via the primitive map. */
type MySqlPrimitiveColumnType<K extends string, T> = T extends string
  ? MySqlPrimitiveColumnMap<K>['string']
  : T extends number
    ? MySqlPrimitiveColumnMap<K>['number']
    : T extends boolean
      ? MySqlPrimitiveColumnMap<K>['boolean']
      : T extends bigint
        ? MySqlPrimitiveColumnMap<K>['bigint']
        : never;

// ============================================================================
// Column Type Mapping
// ============================================================================

/** Maps a TypeScript type to its corresponding MySQL column builder type.
 * Format types are detected via FormatNameOf (the symbol-sentinel key presence idiom)
 * and resolved through MySqlFormatColumnMap; string literal unions become native mysql
 * enum columns; primitives resolve via MySqlPrimitiveColumnMap. Tuple-wrapped extends
 * ([T] extends [string]) stop literal unions from distributing. */
export type MySqlColumnType<K extends string, T> = [FormatNameOf<T>] extends [never]
  ? [T] extends [string]
    ? string extends T
      ? MySqlPrimitiveColumnMap<K>['string']
      : $Type<MySqlEnumColumn<K, T>, T>
    : T extends number | boolean | bigint
      ? MySqlPrimitiveColumnType<K, T>
      : T extends Date
        ? MySqlTimestampColumn<K>
        : T extends any[] | object
          ? $Type<MySqlJsonColumn<K>, T>
          : MySqlColumnBuilderBase
  : FormatNameOf<T> extends keyof MySqlFormatColumnMap<K, T>
    ? MySqlFormatColumnMap<K, T>[FormatNameOf<T>]
    : MySqlColumnBuilderBase;

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
export type MySqlTableConfig<T> = {
  [K in keyof T as K extends string ? K : never]?: MySqlColumnBuilderBase;
};

// ============================================================================
// Auto-Generated Columns Type (for return type)
// ============================================================================

/**
 * Maps each property of T to its corresponding MySQL column builder,
 * with the column name properly typed.
 * Required properties get NotNull applied so InferSelectModel returns T (not T | null).
 * Optional properties remain nullable.
 */
export type AutoGeneratedMySqlColumns<T> = {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  [K in keyof T as K extends string ? K : never]-?: {} extends Pick<T, K>
    ? MySqlColumnType<K & string, NonNullable<T[K]>>
    : MySqlColumnType<K & string, T[K]> & {_: {notNull: true}};
};

// ============================================================================
// Result Type
// ============================================================================

/**
 * Result type for drizzleMysqlTable function.
 * Returns a MySqlTableWithColumns where the columns are built from the auto-generated
 * columns merged with any overrides from tableConfig.
 */
export type DrizzleMySqlTableResult<
  TTableName extends string,
  T,
  TConfig extends MySqlTableConfig<T> = MySqlTableConfig<T>,
> = MySqlTableWithColumns<{
  name: TTableName;
  schema: undefined;
  columns: BuildColumns<TTableName, AutoGeneratedMySqlColumns<T> & TConfig, 'mysql'>;
  dialect: 'mysql';
}>;
