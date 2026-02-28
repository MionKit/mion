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
import type {AllBrandNames} from './common.types.ts';

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
// Brand → Column Mapping
// ============================================================================

/** Maps brand name strings to their corresponding MySQL column builder types.
 * Adding a new brand = add one line here. Compile-time checks below ensure completeness. */
type MySqlBrandColumnMap<K extends string> = {
    // String brands
    email: MySqlVarcharColumn<K>;
    uuid: MySqlVarcharColumn<K>;
    url: MySqlTextColumn<K>;
    domain: MySqlVarcharColumn<K>;
    ip: MySqlVarcharColumn<K>;
    date: MySqlDateColumn<K>;
    time: MySqlTimeColumn<K>;
    dateTime: MySqlDatetimeColumn<K>;
    // Number brands — integer group
    integer: MySqlIntColumn<K>;
    positiveInt: MySqlIntColumn<K>;
    negativeInt: MySqlIntColumn<K>;
    int8: MySqlIntColumn<K>;
    uint8: MySqlIntColumn<K>;
    int16: MySqlIntColumn<K>;
    uint16: MySqlIntColumn<K>;
    int32: MySqlIntColumn<K>;
    uint32: MySqlIntColumn<K>;
    // Number brands — float group
    float: MySqlDoubleColumn<K>;
    positive: MySqlDoubleColumn<K>;
    negative: MySqlDoubleColumn<K>;
};

// Compile-time verification: these resolve to `never` when the map is complete.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MissingMySqlBrands = Exclude<AllBrandNames, keyof MySqlBrandColumnMap<string>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExtraMySqlBrands = Exclude<keyof MySqlBrandColumnMap<string>, AllBrandNames>;

// ============================================================================
// Primitive → Column Mapping
// ============================================================================

/** Maps primitive type names to their corresponding MySQL column builder types.
 * Used by MySqlColumnType for primitive type resolution. */
type MySqlPrimitiveColumnMap<K extends string> = {
    string: MySqlTextColumn<K>;
    number: MySqlDoubleColumn<K>;
    boolean: MySqlBooleanColumn<K>;
    bigint: MySqlBigIntColumn<K>;
};

/** Helper: resolves a TypeScript type to its primitive map key */
type PrimitiveTypeKey<T> = T extends string
    ? 'string'
    : T extends number
      ? 'number'
      : T extends boolean
        ? 'boolean'
        : T extends bigint
          ? 'bigint'
          : never;

// ============================================================================
// Column Type Mapping
// ============================================================================

/** Maps a TypeScript type to its corresponding MySQL column builder type.
 * Branded types are resolved via MySqlBrandColumnMap, primitives via MySqlPrimitiveColumnMap. */
export type MySqlColumnType<K extends string, T> =
    // Branded types → lookup from MySqlBrandColumnMap
    T extends {brand: infer B extends string}
        ? B extends keyof MySqlBrandColumnMap<K>
            ? MySqlBrandColumnMap<K>[B]
            : T extends string
              ? MySqlTextColumn<K>
              : MySqlDoubleColumn<K>
        : // Primitives → lookup from MySqlPrimitiveColumnMap
          PrimitiveTypeKey<T> extends infer P extends keyof MySqlPrimitiveColumnMap<K>
          ? MySqlPrimitiveColumnMap<K>[P]
          : // Special types
            T extends Date
            ? MySqlTimestampColumn<K>
            : T extends any[] | object
              ? MySqlJsonColumn<K>
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
