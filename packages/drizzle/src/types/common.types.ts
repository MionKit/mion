/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunType, RunTypeKindValue, FormatName} from '@ts-runtypes/core';

/** Supported database types */
export type DatabaseType = 'postgres' | 'mysql' | 'sqlite';

// ############### Compile-time assertion helper ###############

/** Compile-time assertion: instantiating with anything but `never` is a type ERROR.
 *  Used by the per-dialect format column maps to enforce 20/20 coverage of the
 *  upstream FormatName registry (missing AND extra keys both fail the build). */
export type MustBeNever<T extends never> = T;

// ############### Drizzle Column Type Constants ###############
// NOTE: These string values must match the drizzle-orm function names exactly.
// Run `npm run validate:drizzle-types -w @mionjs/drizzle` to verify.

/** PostgreSQL-specific drizzle column types */
export const DrizzleTypesPostgres = {
  text: 'text',
  boolean: 'boolean',
  bigint: 'bigint',
  varchar: 'varchar',
  date: 'date',
  time: 'time',
  timestamp: 'timestamp',
  integer: 'integer',
  doublePrecision: 'doublePrecision',
  uuid: 'uuid',
  inet: 'inet',
  char: 'char',
  jsonb: 'jsonb',
} as const;

/** MySQL-specific drizzle column types */
export const DrizzleTypesMySQL = {
  text: 'text',
  boolean: 'boolean',
  bigint: 'bigint',
  varchar: 'varchar',
  date: 'date',
  time: 'time',
  timestamp: 'timestamp',
  json: 'json',
  double: 'double',
  int: 'int',
  datetime: 'datetime',
  mysqlEnum: 'mysqlEnum',
} as const;

/** SQLite-specific drizzle column types */
export const DrizzleTypesSQLite = {
  text: 'text',
  integer: 'integer',
  real: 'real',
  blob: 'blob',
} as const;

/** Combined drizzle column types for backward compatibility */
export const DrizzleTypes = {
  ...DrizzleTypesPostgres,
  ...DrizzleTypesMySQL,
  ...DrizzleTypesSQLite,
} as const;

export type DrizzleTypePostgres = (typeof DrizzleTypesPostgres)[keyof typeof DrizzleTypesPostgres];
export type DrizzleTypeMySQL = (typeof DrizzleTypesMySQL)[keyof typeof DrizzleTypesMySQL];
export type DrizzleTypeSQLite = (typeof DrizzleTypesSQLite)[keyof typeof DrizzleTypesSQLite];
export type DrizzleType = (typeof DrizzleTypes)[keyof typeof DrizzleTypes];

/** Column mapping result from mapper */
export interface ColumnMapping {
  builder: any;
  drizzleType: DrizzleType;
}

/** Factory that creates a ColumnMapping for a primitive type */
export type PrimitiveColumnFactory = (propName: string) => ColumnMapping;

/** Factory that creates a ColumnMapping for a format type (may use params and config) */
export type FormatColumnFactory = (
  propName: string,
  formatParams?: Record<string, any>,
  config?: DrizzleMapperConfig
) => ColumnMapping;

/** Information about a property extracted from TypeScript type */
export interface PropertyInfo {
  /** Property name */
  name: string;
  /** The RunType graph node for this property's type */
  runType: RunType;
  /** Whether the property is optional (?) */
  isOptional: boolean;
  /** Whether the type is a nested object (will become JSON column) */
  isNestedObject: boolean;
  /** Whether the type is an array (will become JSON column) */
  isArray: boolean;
  /** Whether the type is a Date */
  isDate: boolean;
  /** Format name if the type has a format annotation (e.g., 'uuid', 'email'). Narrowed from
   * upstream's untyped `FormatAnnotation.name: string` at the traverser boundary; mappers key
   * their column maps off it and fall back to text for names they do not recognise. */
  formatName?: FormatName;
  /** Format parameters if the type has a format annotation */
  formatParams?: Record<string, any>;
  /** The primitive RunTypeKind value if this is a primitive type */
  primitiveKind?: RunTypeKindValue;
  /** Literal values when the type is a string literal or a union of string literals
   *  (null/undefined members skipped): maps to an enum-carrying column. */
  literalValues?: string[];
}

/** Information about a TypeScript type */
export interface TypeInfo {
  /** The type name (interface/class name) */
  typeName: string;
  /** All properties of the type */
  properties: PropertyInfo[];
}

/** Validation result from config validator */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

/** Default varchar length when no maxLength is specified in format params */
export const DEFAULT_VARCHAR_LENGTH = 255;

/** Default length buffer multiplier for varchar columns */
export const DEFAULT_LENGTH_BUFFER = 1.5;

/** Configuration options for drizzle table mapping */
export interface DrizzleMapperConfig {
  /** Multiplier for maxLength in string formats (default: 1.5). Applied to varchar column lengths. */
  lengthBuffer?: number;
}

/** Applies notNull inline when the property is required in T */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Nullable<T, K extends keyof T, Col> = {} extends Pick<T, K> ? Col : Col & {_: {notNull: true}};
