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
    MySqlTinyIntBuilderInitial,
    MySqlSmallIntBuilderInitial,
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

// ============================================================================
// Helper types for MySQL column builders with column name
// ============================================================================

/** MySQL text column builder with name */
type MySqlTextColumn<K extends string> = MySqlTextBuilderInitial<K, [string, ...string[]]>;
/** MySQL varchar column builder with name */
type MySqlVarcharColumn<K extends string> = MySqlVarCharBuilderInitial<K, [string, ...string[]], number | undefined>;
/** MySQL int column builder with name */
type MySqlIntColumn<K extends string> = MySqlIntBuilderInitial<K>;
/** MySQL tinyint column builder with name */
type MySqlTinyIntColumn<K extends string> = MySqlTinyIntBuilderInitial<K>;
/** MySQL smallint column builder with name */
type MySqlSmallIntColumn<K extends string> = MySqlSmallIntBuilderInitial<K>;
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
 * with the column name properly typed.
 *
 * @template K - The column name (key from the interface)
 * @template T - The TypeScript type of the property value
 *
 * - string → MySqlTextColumn | MySqlVarcharColumn
 * - number → MySqlDoubleColumn | MySqlIntColumn | MySqlTinyIntColumn | MySqlSmallIntColumn
 * - boolean → MySqlBooleanColumn
 * - bigint → MySqlBigIntColumn
 * - Date → MySqlTimestampColumn | MySqlDatetimeColumn | MySqlDateColumn | MySqlTimeColumn
 * - arrays/objects → MySqlJsonColumn
 */
export type MySqlColumnType<K extends string, T> =
    // String types - can be text or varchar
    T extends string
        ? MySqlTextColumn<K> | MySqlVarcharColumn<K>
        : // Number types - can be double, int, tinyint, or smallint
          T extends number
          ? MySqlDoubleColumn<K> | MySqlIntColumn<K> | MySqlTinyIntColumn<K> | MySqlSmallIntColumn<K>
          : // Boolean type
            T extends boolean
            ? MySqlBooleanColumn<K>
            : // BigInt type
              T extends bigint
              ? MySqlBigIntColumn<K>
              : // Date type - can be timestamp, datetime, date, or time
                T extends Date
                ? MySqlTimestampColumn<K> | MySqlDatetimeColumn<K> | MySqlDateColumn<K> | MySqlTimeColumn<K>
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
 * Each property key must exist in T, and the value must be the appropriate column builder
 * for that property's type, with the column name properly typed.
 *
 * This type is used for the `tableConfig` parameter to allow overriding specific columns
 * (e.g., for primary keys, foreign keys, custom constraints).
 */
export type MySqlTableConfig<T> = {
    [K in keyof T as K extends string ? K : never]?: MySqlColumnType<K & string, T[K]>;
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
