/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {BaseRunType} from '@mionkit/run-types';
import type {ReflectionKind} from '@deepkit/type';

/** Supported database types */
export type DatabaseType = 'postgres' | 'mysql' | 'sqlite';

// ############### Drizzle Column Type Constants ###############
// NOTE: These string values must match the drizzle-orm function names exactly.
// Run `npm run validate:drizzle-types -w @mionkit/drizzle` to verify.

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

/** Information about a property extracted from TypeScript type */
export interface PropertyInfo {
    /** Property name */
    name: string;
    /** The RunType for this property's type */
    runType: BaseRunType;
    /** Whether the property is optional (?) */
    isOptional: boolean;
    /** Whether the type is a nested object (will become JSON column) */
    isNestedObject: boolean;
    /** Whether the type is an array (will become JSON column) */
    isArray: boolean;
    /** Whether the type is a Date */
    isDate: boolean;
    /** Format name if the type has a format annotation (e.g., 'uuid', 'email') */
    formatName?: string;
    /** Format parameters if the type has a format annotation */
    formatParams?: Record<string, any>;
    /** The primitive kind if this is a primitive type */
    primitiveKind?: ReflectionKind;
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
