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
    SQLiteIntegerBuilderInitial,
    SQLiteRealBuilderInitial,
    SQLiteBooleanBuilderInitial,
    SQLiteTimestampBuilderInitial,
    SQLiteBigIntBuilderInitial,
    SQLiteBlobJsonBuilderInitial,
} from 'drizzle-orm/sqlite-core';
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
// Helper types for SQLite column builders with column name
// ============================================================================

/** SQLite text column builder with name */
type SqliteTextColumn<K extends string> = SQLiteTextBuilderInitial<K, [string, ...string[]], number | undefined>;
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
/** SQLite json column builder with name (blob mode: json or text mode: json) */
type SqliteJsonColumn<K extends string> = SQLiteBlobJsonBuilderInitial<K>;

// ============================================================================
// Column Type Mapping with Column Name
// ============================================================================

/**
 * Maps a TypeScript primitive type to its corresponding SQLite column builder type,
 * with the column name properly typed. Uses branded types to narrow column types.
 *
 * @template K - The column name (key from the interface)
 * @template T - The TypeScript type of the property value
 *
 * String brands (all map to text in SQLite):
 * - BrandEmail/BrandUUID/BrandUrl/BrandDomain/BrandIP → SqliteTextColumn
 * - BrandDate/BrandTime/BrandDateTime → SqliteTextColumn (stored as ISO strings)
 * - plain string → SqliteTextColumn
 *
 * Number brands:
 * - BrandFloat → SqliteRealColumn
 * - BrandInteger/BrandPositiveInt/BrandNegativeInt → SqliteIntegerColumn
 * - BrandInt8/BrandUInt8/BrandInt16/BrandUInt16/BrandInt32/BrandUInt32 → SqliteIntegerColumn
 * - BrandPositive/BrandNegative → SqliteRealColumn (no integer flag, defaults to real)
 * - plain number → SqliteRealColumn (default to real for safety)
 *
 * Other types:
 * - boolean → SqliteBooleanColumn
 * - bigint → SqliteBigIntColumn
 * - Date → SqliteTimestampColumn
 * - arrays/objects → SqliteJsonColumn
 */
export type SqliteColumnType<K extends string, T> =
    // String branded types - all map to text in SQLite
    T extends BrandUUID | BrandEmail | BrandIP | BrandUrl | BrandDomain | BrandDateTime | BrandDate | BrandTime
        ? SqliteTextColumn<K>
        : // Number branded types - narrow to specific column types
          T extends BrandFloat
          ? SqliteRealColumn<K>
          : T extends
                  | BrandInteger
                  | BrandPositiveInt
                  | BrandNegativeInt
                  | BrandInt8
                  | BrandUInt8
                  | BrandInt16
                  | BrandUInt16
                  | BrandInt32
                  | BrandUInt32
            ? SqliteIntegerColumn<K>
            : T extends BrandPositive | BrandNegative
              ? SqliteRealColumn<K>
              : // Plain string types - text
                T extends string
                ? SqliteTextColumn<K>
                : // Plain number types - default to real for safety
                  T extends number
                  ? SqliteRealColumn<K>
                  : // Boolean type - integer with mode: boolean
                    T extends boolean
                    ? SqliteBooleanColumn<K>
                    : // BigInt type - blob with mode: bigint
                      T extends bigint
                      ? SqliteBigIntColumn<K>
                      : // Date type - integer with mode: timestamp
                        T extends Date
                        ? SqliteTimestampColumn<K>
                        : // Arrays and objects become JSON (blob or text with mode: json)
                          T extends any[] | object
                          ? SqliteJsonColumn<K>
                          : // Fallback to base column builder
                            SQLiteColumnBuilderBase;

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
 *
 * Unlike SqliteTableConfig (which is partial), this maps ALL properties to column builders.
 */
export type AutoGeneratedSqliteColumns<T> = {
    [K in keyof T as K extends string ? K : never]: SqliteColumnType<K & string, T[K]>;
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
