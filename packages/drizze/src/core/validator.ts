/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {PropertyInfo, TypeInfo, ValidationResult} from '../types/common.types';
import {ErrorMessages} from './errors';

/** Validates that provided table config matches the TypeScript type */
export function validateConfig(typeInfo: TypeInfo, tableConfig: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const prop of typeInfo.properties) {
        const configColumn = tableConfig[prop.name];
        // Column not in config - will be auto-generated
        if (!configColumn) continue;
        // Validate type compatibility
        const typeError = validateTypeCompatibility(prop, configColumn);
        if (typeError) errors.push(typeError);
        // Validate nullability
        const nullError = validateNullability(prop, configColumn);
        if (nullError) errors.push(nullError);
        // Validate format constraints
        const formatWarning = validateFormatConstraints(prop, configColumn);
        if (formatWarning) warnings.push(formatWarning);
    }
    // Check for extra columns in config that don't exist in type
    for (const configKey of Object.keys(tableConfig)) {
        const exists = typeInfo.properties.some((p) => p.name === configKey);
        if (!exists) errors.push(ErrorMessages.EXTRA_COLUMN(configKey, typeInfo.typeName));
    }
    return {valid: errors.length === 0, errors, warnings};
}

/** Validates that the drizzle column type is compatible with the TypeScript type */
function validateTypeCompatibility(prop: PropertyInfo, column: any): string | null {
    const columnType = getColumnType(column);
    const expectedTypes = getExpectedColumnTypes(prop);
    if (expectedTypes.length > 0 && !expectedTypes.includes(columnType)) {
        return ErrorMessages.TYPE_MISMATCH(prop.name, expectedTypes.join(' or '), columnType);
    }
    return null;
}

/** Validates that nullability constraints match */
function validateNullability(prop: PropertyInfo, column: any): string | null {
    const isColumnNotNull = hasNotNullConstraint(column);
    if (prop.isOptional && isColumnNotNull) return ErrorMessages.NULLABILITY_MISMATCH(prop.name);
    return null;
}

/** Validates format constraints (warnings only) */
function validateFormatConstraints(prop: PropertyInfo, column: any): string | null {
    if (!prop.formatParams) return null;
    // Check maxLength constraint
    if (prop.formatParams.maxLength) {
        const columnLength = getColumnLength(column);
        if (columnLength && columnLength < prop.formatParams.maxLength) {
            return `Column "${prop.name}" has length ${columnLength} but type format requires maxLength ${prop.formatParams.maxLength}`;
        }
    }
    return null;
}

/** Gets the drizzle column type from a column builder */
function getColumnType(column: any): string {
    // Drizzle columns have internal type info
    // Try different properties that might contain the type
    if (column.dataType) return column.dataType;
    if (column.columnType) return column.columnType;
    if (column._ && column._.dataType) return column._.dataType;
    // Check config object (used by column builders)
    if (column.config && column.config.dataType) return column.config.dataType;
    if (column.config && column.config.columnType) return column.config.columnType;
    // Check constructor name for column builders
    if (column.constructor && column.constructor.name) {
        const name = column.constructor.name;
        // Map constructor names to data types
        if (name.includes('UUID')) return 'string';
        if (name.includes('Text')) return 'string';
        if (name.includes('Varchar')) return 'string';
        if (name.includes('Char')) return 'string';
        if (name.includes('Integer') || name.includes('Int')) return 'number';
        if (name.includes('Boolean')) return 'boolean';
        if (name.includes('Timestamp') || name.includes('Date')) return 'date';
        if (name.includes('Json')) return 'json';
        if (name.includes('Double') || name.includes('Real') || name.includes('Float')) return 'number';
        if (name.includes('BigInt')) return 'bigint';
    }
    return 'unknown';
}

/** Checks if a column has a notNull constraint */
function hasNotNullConstraint(column: any): boolean {
    if (column.notNull === true) return true;
    if (column._ && column._.notNull === true) return true;
    return false;
}

/** Gets the length constraint from a column if it has one */
function getColumnLength(column: any): number | null {
    if (column.length) return column.length;
    if (column._ && column._.length) return column._.length;
    return null;
}

/** Gets the expected drizzle column types for a TypeScript property */
function getExpectedColumnTypes(prop: PropertyInfo): string[] {
    // If it's a nested object or array, expect JSON types
    if (prop.isNestedObject || prop.isArray) return ['json', 'jsonb', 'text'];
    // Check format-specific types
    if (prop.formatName) return getExpectedTypesForFormat(prop.formatName);
    // Check primitive types
    if (prop.primitiveKind !== undefined) return getExpectedTypesForPrimitive(prop.primitiveKind);
    // Check for Date type
    const kind = prop.runType.src.kind;
    if (kind === ReflectionKind.class) {
        // Could be Date or other class
        const typeName = prop.runType.getTypeName();
        if (typeName === 'Date') return ['timestamp', 'date', 'datetime', 'integer', 'text'];
    }

    return [];
}

/** Gets expected column types for a format name */
function getExpectedTypesForFormat(formatName: string): string[] {
    switch (formatName) {
        case 'uuid':
            return ['uuid', 'varchar', 'text'];
        case 'email':
            return ['text', 'varchar'];
        case 'url':
            return ['text', 'varchar'];
        case 'ip':
            return ['inet', 'varchar', 'text'];
        case 'date':
            return ['date', 'text'];
        case 'time':
            return ['time', 'text'];
        case 'dateTime':
            return ['timestamp', 'datetime', 'text'];
        case 'numberFormat':
            return ['integer', 'int', 'smallint', 'bigint', 'real', 'double', 'doublePrecision', 'numeric', 'decimal'];
        case 'bigIntFormat':
            return ['bigint', 'blob'];
        default:
            return [];
    }
}

/** Gets expected column types for a primitive kind */
function getExpectedTypesForPrimitive(kind: ReflectionKind): string[] {
    switch (kind) {
        case ReflectionKind.string:
            // 'string' is the dataType returned by drizzle for text-based columns
            return ['text', 'varchar', 'char', 'uuid', 'inet', 'string'];
        case ReflectionKind.number:
            // 'number' is the dataType returned by drizzle for numeric columns
            return ['integer', 'int', 'smallint', 'real', 'double', 'doublePrecision', 'numeric', 'decimal', 'number'];
        case ReflectionKind.boolean:
            return ['boolean', 'integer'];
        case ReflectionKind.bigint:
            return ['bigint', 'blob'];
        default:
            return [];
    }
}
