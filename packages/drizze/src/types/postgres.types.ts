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
 * with the column name properly typed.
 *
 * @template K - The column name (key from the interface)
 * @template T - The TypeScript type of the property value
 *
 * - string → PgTextColumn | PgVarcharColumn | PgUUIDColumn | PgInetColumn
 * - number → PgDoublePrecisionColumn | PgIntegerColumn
 * - boolean → PgBooleanColumn
 * - bigint → PgBigIntColumn
 * - Date → PgTimestampColumn | PgDateColumn | PgTimeColumn
 * - arrays/objects → PgJsonbColumn
 */
export type PgColumnType<K extends string, T> =
    // String types - can be text, varchar, uuid, inet, etc.
    T extends string
        ? PgTextColumn<K> | PgVarcharColumn<K> | PgUUIDColumn<K> | PgInetColumn<K>
        : // Number types - can be double precision or integer
          T extends number
          ? PgDoublePrecisionColumn<K> | PgIntegerColumn<K>
          : // Boolean type
            T extends boolean
            ? PgBooleanColumn<K>
            : // BigInt type
              T extends bigint
              ? PgBigIntColumn<K>
              : // Date type - can be timestamp, date, or time
                T extends Date
                ? PgTimestampColumn<K> | PgDateColumn<K> | PgTimeColumn<K>
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
 * Each property key must exist in T, and the value must be the appropriate column builder
 * for that property's type, with the column name properly typed.
 *
 * This type is used for the `tableConfig` parameter to allow overriding specific columns
 * (e.g., for primary keys, foreign keys, custom constraints).
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
 * // Valid config - types match and column names are typed
 * const config: PgTableConfig<User> = {
 *   id: uuid('id').primaryKey(),  // string → PgUUIDColumn<'id'> ✓
 *   name: text('name'),           // string → PgTextColumn<'name'> ✓
 *   age: integer('age'),          // number → PgIntegerColumn<'age'> ✓
 * };
 * ```
 */
export type PgTableConfig<T> = {
    [K in keyof T as K extends string ? K : never]?: PgColumnType<K & string, T[K]>;
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
