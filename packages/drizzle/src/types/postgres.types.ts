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
import type {FormatName, FormatNameOf, FormatParamsOf} from '@ts-runtypes/core';
import {typeFormats} from '@ts-runtypes/core';
import type {MustBeNever} from './common.types.ts';

// ============================================================================
// Helper type to extract return type of column builder function with name
// ============================================================================

/** Gets the return type of text(name) */
type PgTextColumn<K extends string> = ReturnType<typeof text<K, string, readonly [string, ...string[]]>>;
/** Gets the return type of text(name, {enum}) carrying a literal-union enum */
type PgTextEnumColumn<K extends string, T> = ReturnType<typeof text<K, T & string, readonly [T & string, ...(T & string)[]]>>;
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
/** Gets the return type of timestamp(name, {mode: 'string'}) */
type PgTimestampStringColumn<K extends string> = ReturnType<typeof timestamp<K, 'string'>>;
/** Gets the return type of date(name) */
type PgDateColumn<K extends string> = ReturnType<typeof date<K, 'date'>>;
/** Gets the return type of date(name, {mode: 'string'}) */
type PgDateStringColumn<K extends string> = ReturnType<typeof date<K, 'string'>>;
/** Gets the return type of time(name) */
type PgTimeColumn<K extends string> = ReturnType<typeof time<K>>;
/** Gets the return type of jsonb(name) */
type PgJsonbColumn<K extends string> = ReturnType<typeof jsonb<K>>;

// ============================================================================
// Format → Column Mapping (mirrors the runtime map in mappers/pg.mapper.ts)
// ============================================================================

/** Maps every upstream format name to its PostgreSQL column builder type, keyed by the
 *  typeFormats registry so names can never drift. The MustBeNever asserts below make
 *  the map exhaustive: a format added upstream fails this file's compile until mapped.
 *  Temporal columns are typed WITHOUT $Type: the runtime stores ISO strings and the
 *  driver returns strings, never Temporal instances. */
type PgFormatColumnMap<K extends string, T> = {
  [typeFormats.email.name]: $Type<PgVarcharColumn<K>, T>;
  [typeFormats.uuid.name]: $Type<PgUUIDColumn<K>, T>;
  [typeFormats.url.name]: $Type<PgVarcharColumn<K>, T>;
  [typeFormats.domain.name]: $Type<PgVarcharColumn<K>, T>;
  [typeFormats.ip.name]: $Type<PgInetColumn<K>, T>;
  [typeFormats.date.name]: $Type<PgDateColumn<K>, T>;
  [typeFormats.time.name]: $Type<PgTimeColumn<K>, T>;
  [typeFormats.dateTime.name]: $Type<PgTimestampColumn<K>, T>;
  [typeFormats.stringFormat.name]: $Type<PgVarcharColumn<K>, T>;
  [typeFormats.bigintFormat.name]: $Type<PgBigIntColumn<K>, T>;
  [typeFormats.numberFormat.name]: FormatParamsOf<T> extends {integer: true}
    ? $Type<PgIntegerColumn<K>, T>
    : $Type<PgDoublePrecisionColumn<K>, T>;
  [typeFormats.nativeDate.name]: $Type<PgTimestampColumn<K>, T>;
  [typeFormats.temporalInstant.name]: PgTimestampStringColumn<K>;
  [typeFormats.temporalZonedDateTime.name]: PgTextColumn<K>;
  [typeFormats.temporalPlainDate.name]: PgDateStringColumn<K>;
  [typeFormats.temporalPlainTime.name]: PgTimeColumn<K>;
  [typeFormats.temporalPlainDateTime.name]: PgTimestampStringColumn<K>;
  [typeFormats.temporalPlainYearMonth.name]: PgVarcharColumn<K>;
  [typeFormats.formattedArray.name]: $Type<PgJsonbColumn<K>, T>;
  [typeFormats.formattedObject.name]: $Type<PgJsonbColumn<K>, T>;
};

// Compile-time exhaustiveness: these FAIL to compile when the map drifts from FormatName.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _MissingPgFormats = MustBeNever<Exclude<FormatName, keyof PgFormatColumnMap<string, unknown>>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ExtraPgFormats = MustBeNever<Exclude<keyof PgFormatColumnMap<string, unknown>, FormatName>>;

// ============================================================================
// Primitive → Column Mapping
// ============================================================================

/** Maps primitive type names to their corresponding PostgreSQL column builder types. */
type PgPrimitiveColumnMap<K extends string> = {
  string: PgVarcharColumn<K>;
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
 * Format types are detected via FormatNameOf (the symbol-sentinel key presence idiom)
 * and resolved through PgFormatColumnMap; string literal unions become enum-carrying
 * text columns; primitives resolve via PgPrimitiveColumnMap. Tuple-wrapped extends
 * ([T] extends [string]) stop literal unions from distributing. */
export type PgColumnType<K extends string, T> = [FormatNameOf<T>] extends [never]
  ? [T] extends [string]
    ? string extends T
      ? PgPrimitiveColumnMap<K>['string']
      : $Type<PgTextEnumColumn<K, T>, T>
    : T extends number | boolean | bigint
      ? PgPrimitiveColumnType<K, T>
      : T extends Date
        ? PgTimestampColumn<K>
        : T extends any[] | object
          ? $Type<PgJsonbColumn<K>, T>
          : PgColumnBuilderBase
  : FormatNameOf<T> extends keyof PgFormatColumnMap<K, T>
    ? PgFormatColumnMap<K, T>[FormatNameOf<T>]
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
