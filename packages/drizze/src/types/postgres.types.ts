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
import type {$Type} from 'drizzle-orm/column-builder';
import type {AllBrandNames} from './common.types.ts';

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
// Brand → Column Mapping
// ============================================================================

/** Maps brand name strings to their corresponding PostgreSQL column builder types.
 * Adding a new brand = add one line here. Compile-time checks below ensure completeness. */
type PgBrandColumnMap<K extends string> = {
    // String brands
    email: PgVarcharColumn<K>;
    uuid: PgUUIDColumn<K>;
    url: PgTextColumn<K>;
    domain: PgTextColumn<K>;
    ip: PgInetColumn<K>;
    date: PgDateColumn<K>;
    time: PgTimeColumn<K>;
    dateTime: PgTimestampColumn<K>;
    // Number brands — integer group
    integer: PgIntegerColumn<K>;
    positiveInt: PgIntegerColumn<K>;
    negativeInt: PgIntegerColumn<K>;
    int8: PgIntegerColumn<K>;
    uint8: PgIntegerColumn<K>;
    int16: PgIntegerColumn<K>;
    uint16: PgIntegerColumn<K>;
    int32: PgIntegerColumn<K>;
    uint32: PgIntegerColumn<K>;
    // Number brands — float group
    float: PgDoublePrecisionColumn<K>;
    positive: PgDoublePrecisionColumn<K>;
    negative: PgDoublePrecisionColumn<K>;
};

// Compile-time verification: these resolve to `never` when the map is complete.
// If a brand is missing/extra, the type will show the offending brand name string.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MissingPgBrands = Exclude<AllBrandNames, keyof PgBrandColumnMap<string>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExtraPgBrands = Exclude<keyof PgBrandColumnMap<string>, AllBrandNames>;

// ============================================================================
// Primitive → Column Mapping
// ============================================================================

/** Maps primitive type names to their corresponding PostgreSQL column builder types. */
type PgPrimitiveColumnMap<K extends string> = {
    string: PgTextColumn<K>;
    number: PgDoublePrecisionColumn<K>;
    boolean: PgBooleanColumn<K>;
    bigint: PgBigIntColumn<K>;
};

/** Resolves a primitive TS type to its PostgreSQL column builder via the primitive map. */
type PgPrimitiveColumnType<K extends string, T> = T extends string
    ? PgPrimitiveColumnMap<K>['string']
    : T extends number
      ? PgPrimitiveColumnMap<K>['number']
      : T extends boolean
        ? PgPrimitiveColumnMap<K>['boolean']
        : T extends bigint
          ? PgPrimitiveColumnMap<K>['bigint']
          : never;

// ============================================================================
// Column Type Mapping
// ============================================================================

/** Maps a TypeScript type to its corresponding PostgreSQL column builder type.
 * Branded types are resolved via PgBrandColumnMap, primitives via PgPrimitiveColumnMap. */
export type PgColumnType<K extends string, T> =
    // Branded types → lookup column from map, use $Type to preserve original branded type
    T extends {brand: infer B extends string}
        ? B extends keyof PgBrandColumnMap<K>
            ? $Type<PgBrandColumnMap<K>[B], T>
            : T extends string
              ? $Type<PgTextColumn<K>, T>
              : $Type<PgDoublePrecisionColumn<K>, T>
        : // Primitives → guard with union check to avoid `never extends keyof Map` trap
          T extends string | number | boolean | bigint
          ? PgPrimitiveColumnType<K, T>
          : // Special types
            T extends Date
            ? PgTimestampColumn<K>
            : T extends any[] | object
              ? $Type<PgJsonbColumn<K>, T>
              : PgColumnBuilderBase;

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
 * Required properties get NotNull applied so InferSelectModel returns T (not T | null).
 * Optional properties remain nullable.
 */
export type AutoGeneratedPgColumns<T> = {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    [K in keyof T as K extends string ? K : never]-?: {} extends Pick<T, K>
        ? PgColumnType<K & string, NonNullable<T[K]>>
        : PgColumnType<K & string, T[K]> & {_: {notNull: true}};
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
