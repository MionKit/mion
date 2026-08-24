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
import type {BuildColumns, $Type} from 'drizzle-orm/column-builder';
import type {AllBrandNames} from './common.types.ts';

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
// Brand → Column Mapping
// ============================================================================

/** Maps brand name strings to their corresponding SQLite column builder types.
 * Adding a new brand = add one line here. Compile-time checks below ensure completeness. */
type SqliteBrandColumnMap<K extends string> = {
    // String brands — all map to text in SQLite
    email: SqliteTextColumn<K>;
    uuid: SqliteTextColumn<K>;
    url: SqliteTextColumn<K>;
    domain: SqliteTextColumn<K>;
    ip: SqliteTextColumn<K>;
    date: SqliteTextColumn<K>;
    time: SqliteTextColumn<K>;
    dateTime: SqliteTextColumn<K>;
    // Number brands — integer group
    integer: SqliteIntegerColumn<K>;
    positiveInt: SqliteIntegerColumn<K>;
    negativeInt: SqliteIntegerColumn<K>;
    int8: SqliteIntegerColumn<K>;
    uint8: SqliteIntegerColumn<K>;
    int16: SqliteIntegerColumn<K>;
    uint16: SqliteIntegerColumn<K>;
    int32: SqliteIntegerColumn<K>;
    uint32: SqliteIntegerColumn<K>;
    // Number brands — float group
    float: SqliteRealColumn<K>;
    positive: SqliteRealColumn<K>;
    negative: SqliteRealColumn<K>;
};

// Compile-time verification: these resolve to `never` when the map is complete.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MissingSqliteBrands = Exclude<AllBrandNames, keyof SqliteBrandColumnMap<string>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExtraSqliteBrands = Exclude<keyof SqliteBrandColumnMap<string>, AllBrandNames>;

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
 * Branded types are resolved via SqliteBrandColumnMap, primitives via SqlitePrimitiveColumnMap. */
export type SqliteColumnType<K extends string, T> =
    // Branded types → lookup column from map, use $Type to preserve original branded type
    T extends {brand: infer B extends string}
        ? B extends keyof SqliteBrandColumnMap<K>
            ? $Type<SqliteBrandColumnMap<K>[B], T>
            : T extends string
              ? $Type<SqliteTextColumn<K>, T>
              : $Type<SqliteRealColumn<K>, T>
        : // Primitives → guard with union check to avoid `never extends keyof Map` trap
          T extends string | number | boolean | bigint
          ? SqlitePrimitiveColumnType<K, T>
          : // Special types
            T extends Date
            ? SqliteTimestampColumn<K>
            : T extends any[] | object
              ? $Type<SqliteJsonColumn<K>, T>
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
