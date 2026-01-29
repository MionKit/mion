/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    PgColumnBuilderBase,
    text,
    varchar,
    uuid,
    integer,
    doublePrecision,
    boolean,
    bigint,
    timestamp,
    date,
    time,
    jsonb,
    inet,
    pgTable,
} from 'drizzle-orm/pg-core';
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
// Helper type to extract return type of column builder function with name
// ============================================================================

/** Gets the return type of text(name) */
type PgTextColumn<K extends string> = ReturnType<typeof text<K, string, readonly [string, ...string[]]>>;
/** Gets the return type of varchar(name) */
type PgVarcharColumn<K extends string> = ReturnType<
    typeof varchar<K, string, readonly [string, ...string[]], number | undefined>
>;
/** Gets the return type of uuid(name) */
type PgUUIDColumn<K extends string> = ReturnType<typeof uuid<K>>;
/** Gets the return type of inet(name) */
type PgInetColumn<K extends string> = ReturnType<typeof inet<K>>;
/** Gets the return type of integer(name) */
type PgIntegerColumn<K extends string> = ReturnType<typeof integer<K>>;
/** Gets the return type of doublePrecision(name) */
type PgDoublePrecisionColumn<K extends string> = ReturnType<typeof doublePrecision<K>>;
/** Gets the return type of boolean(name) */
type PgBooleanColumn<K extends string> = ReturnType<typeof boolean<K>>;
/** Gets the return type of bigint(name) in bigint mode */
type PgBigIntColumn<K extends string> = ReturnType<typeof bigint<K, 'bigint'>>;
/** Gets the return type of timestamp(name) */
type PgTimestampColumn<K extends string> = ReturnType<typeof timestamp<K, 'date'>>;
/** Gets the return type of date(name) */
type PgDateColumn<K extends string> = ReturnType<typeof date<K, 'date'>>;
/** Gets the return type of time(name) */
type PgTimeColumn<K extends string> = ReturnType<typeof time<K>>;
/** Gets the return type of jsonb(name) */
type PgJsonbColumn<K extends string> = ReturnType<typeof jsonb<K>>;

// ============================================================================
// Column Type Mapping with Column Name
// ============================================================================

/**
 * Maps a TypeScript primitive type to its corresponding PostgreSQL column builder type,
 * with the column name properly typed. Uses branded types to narrow column types.
 *
 * @template K - The column name (key from the interface)
 * @template T - The TypeScript type of the property value
 *
 * String brands:
 * - BrandEmail → PgVarcharColumn (emails have max length)
 * - BrandUUID → PgUUIDColumn (native UUID type)
 * - BrandUrl → PgTextColumn (URLs can be long)
 * - BrandDomain → PgTextColumn
 * - BrandIP → PgInetColumn (native inet type)
 * - BrandDate → PgDateColumn
 * - BrandTime → PgTimeColumn
 * - BrandDateTime → PgTimestampColumn
 * - plain string → PgTextColumn (unlimited length, same performance as varchar in PG)
 *
 * Number brands:
 * - BrandFloat → PgDoublePrecisionColumn
 * - BrandInteger/BrandPositiveInt/BrandNegativeInt → PgIntegerColumn
 * - BrandInt8/BrandUInt8/BrandInt16/BrandUInt16 → PgIntegerColumn (runtime uses integer)
 * - BrandInt32/BrandUInt32 → PgIntegerColumn
 * - BrandPositive/BrandNegative → PgDoublePrecisionColumn (could be float or int, default to double)
 * - plain number → PgDoublePrecisionColumn (default to double precision for safety)
 *
 * Other types:
 * - boolean → PgBooleanColumn
 * - bigint → PgBigIntColumn
 * - Date → PgTimestampColumn (runtime uses timestamp)
 * - arrays/objects → PgJsonbColumn
 */
export type PgColumnType<K extends string, T> =
    // String branded types - narrow to specific column types
    T extends BrandUUID
        ? PgUUIDColumn<K>
        : T extends BrandEmail
          ? PgVarcharColumn<K>
          : T extends BrandIP
            ? PgInetColumn<K>
            : T extends BrandDateTime
              ? PgTimestampColumn<K>
              : T extends BrandDate
                ? PgDateColumn<K>
                : T extends BrandTime
                  ? PgTimeColumn<K>
                  : T extends BrandUrl | BrandDomain
                    ? PgTextColumn<K>
                    : // Number branded types - narrow to specific column types
                      T extends BrandFloat
                      ? PgDoublePrecisionColumn<K>
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
                        ? PgIntegerColumn<K>
                        : T extends BrandPositive | BrandNegative
                          ? PgDoublePrecisionColumn<K>
                          : // Plain string types - use text (unlimited length, same perf as varchar in PG)
                            T extends string
                            ? PgTextColumn<K>
                            : // Plain number types - default to double precision for safety
                              T extends number
                              ? PgDoublePrecisionColumn<K>
                              : // Boolean type
                                T extends boolean
                                ? PgBooleanColumn<K>
                                : // BigInt type
                                  T extends bigint
                                  ? PgBigIntColumn<K>
                                  : // Date type - use timestamp (runtime uses timestamp)
                                    T extends Date
                                    ? PgTimestampColumn<K>
                                    : // Arrays and objects become JSONB
                                      T extends any[] | object
                                      ? PgJsonbColumn<K>
                                      : // Fallback to base column builder
                                        PgColumnBuilderBase;

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
 *
 * @example
 * ```typescript
 * interface User {
 *   id: string;
 *   name: string;
 *   age: number;
 *   active: boolean;
 * }
 *
 * // Valid config - override with any column type
 * const config: PgTableConfig<User> = {
 *   id: uuid('id').primaryKey(),  // Override string with uuid ✓
 *   name: text('name'),           // Use default text ✓
 *   age: integer('age'),          // Override number with integer ✓
 * };
 * ```
 */
export type PgTableConfig<T> = {
    [K in keyof T as K extends string ? K : never]?: PgColumnBuilderBase;
};

// ============================================================================
// Auto-Generated Columns Type (for return type)
// ============================================================================

/**
 * Maps each property of T to its corresponding PostgreSQL column builder,
 * with the column name properly typed.
 *
 * Unlike PgTableConfig (which is partial), this maps ALL properties to column builders.
 */
export type AutoGeneratedPgColumns<T> = {
    [K in keyof T as K extends string ? K : never]: PgColumnType<K & string, T[K]>;
};

// ============================================================================
// Result Type
// ============================================================================

/**
 * Result type for drizzlePGTable function.
 * Returns a PgTableWithColumns where the columns are built from the auto-generated
 * columns merged with any overrides from tableConfig.
 *
 * The goal is that `drizzlePGTable<User>('users')` returns the same type as
 * `pgTable('users', {id: text('id'), name: text('name'), ...})`.
 */
export type DrizzlePgTableResult<TTableName extends string, TConfig extends Record<string, any>> = ReturnType<
    typeof pgTable<TTableName, TConfig>
>;

// ============================================================================
// Test Types - for verifying type mappings work correctly
// ============================================================================

/** Test interface to verify type mappings */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface _TestUser {
    id: string;
    name: string;
    email: string;
    age: number;
    isActive: boolean;
    balance: bigint;
    createdAt: Date;
    tags: string[]; // Array → PgJsonbColumn<'tags'>
    profile: {bio: string; avatar: string}; // Nested object → PgJsonbColumn<'profile'>
}

/** Test: PgTableConfig should map each property to its column type */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TestPgTableConfig = PgTableConfig<_TestUser>;
// Expected shape:
// {
//   id?: PgTextColumn<'id'> | PgVarcharColumn<'id'> | PgUUIDColumn<'id'> | PgInetColumn<'id'>;
//   name?: PgTextColumn<'name'> | PgVarcharColumn<'name'> | PgUUIDColumn<'name'> | PgInetColumn<'name'>;
//   email?: PgTextColumn<'email'> | PgVarcharColumn<'email'> | PgUUIDColumn<'email'> | PgInetColumn<'email'>;
//   age?: PgDoublePrecisionColumn<'age'> | PgIntegerColumn<'age'>;
//   isActive?: PgBooleanColumn<'isActive'>;
//   balance?: PgBigIntColumn<'balance'>;
//   createdAt?: PgTimestampColumn<'createdAt'> | PgDateColumn<'createdAt'> | PgTimeColumn<'createdAt'>;
//   tags?: PgJsonbColumn<'tags'>;           // Array maps to JSONB
//   profile?: PgJsonbColumn<'profile'>;     // Nested object maps to JSONB
// }

/** Test: AutoGeneratedPgColumns should map ALL properties (required) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TestAutoGeneratedPgColumns = AutoGeneratedPgColumns<_TestUser>;

/** Test: DrizzlePgTableResult should return proper table type */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _TestDrizzlePgTableResult = DrizzlePgTableResult<'users', _TestUser>;
