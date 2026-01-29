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
    MySqlDateTimeBuilderInitial,
    MySqlDateBuilderInitial,
    MySqlTimeBuilderInitial,
    MySqlJsonBuilderInitial,
} from 'drizzle-orm/mysql-core';
import type {BuildColumns} from 'drizzle-orm/column-builder';
import type {
    BrandEmail,
    BrandUUID,
    BrandUrl,
    BrandDomain,
    BrandIP,
    BrandDate,
    BrandTime,
    BrandDateTime,
    BrandInteger,
    BrandFloat,
    BrandPositive,
    BrandNegative,
    BrandPositiveInt,
    BrandNegativeInt,
    BrandInt8,
    BrandInt16,
    BrandInt32,
    BrandUInt8,
    BrandUInt16,
    BrandUInt32,
} from '@mionkit/core';

// ============================================================================
// Helper types for MySQL column builders with column name
// ============================================================================

/** MySQL text column builder with name */
type MySqlTextColumn<K extends string> = MySqlTextBuilderInitial<K, [string, ...string[]]>;
/** MySQL varchar column builder with name */
type MySqlVarcharColumn<K extends string> = MySqlVarCharBuilderInitial<K, [string, ...string[]], number | undefined>;
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
/** MySQL datetime column builder with name */
type MySqlDatetimeColumn<K extends string> = MySqlDateTimeBuilderInitial<K>;
/** MySQL date column builder with name */
type MySqlDateColumn<K extends string> = MySqlDateBuilderInitial<K>;
/** MySQL time column builder with name */
type MySqlTimeColumn<K extends string> = MySqlTimeBuilderInitial<K>;
/** MySQL json column builder with name */
type MySqlJsonColumn<K extends string> = MySqlJsonBuilderInitial<K>;

// ============================================================================
// Column Type Mapping with Column Name
// ============================================================================

/**
 * Maps a TypeScript primitive type to its corresponding MySQL column builder type,
 * with the column name properly typed. Uses branded types to narrow column types.
 *
 * @template K - The column name (key from the interface)
 * @template T - The TypeScript type of the property value
 *
 * String brands:
 * - BrandEmail → MySqlVarcharColumn (emails have max length)
 * - BrandUUID → MySqlVarcharColumn (MySQL has no native UUID, use varchar(36))
 * - BrandUrl → MySqlTextColumn (URLs can be long)
 * - BrandDomain → MySqlVarcharColumn
 * - BrandIP → MySqlVarcharColumn (IPv6 up to 45 chars)
 * - BrandDate → MySqlDateColumn
 * - BrandTime → MySqlTimeColumn
 * - BrandDateTime → MySqlDatetimeColumn
 * - plain string → MySqlTextColumn | MySqlVarcharColumn
 *
 * Number brands:
 * - BrandFloat → MySqlDoubleColumn
 * - BrandInt8/BrandUInt8 → MySqlTinyIntColumn
 * - BrandInt16/BrandUInt16 → MySqlSmallIntColumn
 * - BrandInteger/BrandPositiveInt/BrandNegativeInt/BrandInt32/BrandUInt32 → MySqlIntColumn
 * - BrandPositive/BrandNegative → MySqlDoubleColumn | MySqlIntColumn
 * - plain number → MySqlDoubleColumn (default to double for safety)
 *
 * Other types:
 * - boolean → MySqlBooleanColumn
 * - bigint → MySqlBigIntColumn
 * - Date → MySqlTimestampColumn | MySqlDatetimeColumn | MySqlDateColumn | MySqlTimeColumn
 * - arrays/objects → MySqlJsonColumn
 */
export type MySqlColumnType<K extends string, T> =
    // String branded types - narrow to specific column types
    T extends BrandUUID
        ? MySqlVarcharColumn<K>
        : T extends BrandEmail
          ? MySqlVarcharColumn<K>
          : T extends BrandIP
            ? MySqlVarcharColumn<K>
            : T extends BrandDateTime
              ? MySqlDatetimeColumn<K>
              : T extends BrandDate
                ? MySqlDateColumn<K>
                : T extends BrandTime
                  ? MySqlTimeColumn<K>
                  : T extends BrandUrl
                    ? MySqlTextColumn<K>
                    : T extends BrandDomain
                      ? MySqlVarcharColumn<K>
                      : // Number branded types - all integers use int() in runtime mapper
                        T extends BrandFloat
                        ? MySqlDoubleColumn<K>
                        : T extends
                                | BrandInt8
                                | BrandUInt8
                                | BrandInt16
                                | BrandUInt16
                                | BrandInteger
                                | BrandPositiveInt
                                | BrandNegativeInt
                                | BrandInt32
                                | BrandUInt32
                          ? MySqlIntColumn<K>
                          : T extends BrandPositive | BrandNegative
                            ? MySqlDoubleColumn<K>
                            : // Plain string types - use text (unlimited length)
                              T extends string
                              ? MySqlTextColumn<K>
                              : // Plain number types - default to double for safety
                                T extends number
                                ? MySqlDoubleColumn<K>
                                : // Boolean type
                                  T extends boolean
                                  ? MySqlBooleanColumn<K>
                                  : // BigInt type
                                    T extends bigint
                                    ? MySqlBigIntColumn<K>
                                    : // Date type - use timestamp (runtime uses timestamp)
                                      T extends Date
                                      ? MySqlTimestampColumn<K>
                                      : // Arrays and objects become JSON
                                        T extends any[] | object
                                        ? MySqlJsonColumn<K>
                                        : // Fallback to base column builder
                                          MySqlColumnBuilderBase;

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
 *
 * Unlike MySqlTableConfig (which is partial), this maps ALL properties to column builders.
 */
export type AutoGeneratedMySqlColumns<T> = {
    [K in keyof T as K extends string ? K : never]: MySqlColumnType<K & string, T[K]>;
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
