/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RunTypeKind} from '@ts-runtypes/core';
import type {FormatName, RunTypeKindValue} from '@ts-runtypes/core';
import type {PropertyInfo, TypeInfo, ValidationResult} from '../types/common.types.ts';

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
    if (!exists) errors.push(`Column "${configKey}" exists in tableConfig but not in type "${typeInfo.typeName}"`);
  }
  return {valid: errors.length === 0, errors, warnings};
}

/** Validates that the drizzle column type is compatible with the TypeScript type */
function validateTypeCompatibility(prop: PropertyInfo, column: any): string | null {
  const columnType = getColumnType(column);
  const expectedTypes = getExpectedColumnTypes(prop);
  if (expectedTypes.length > 0 && !expectedTypes.includes(columnType)) {
    return `Type mismatch for property "${prop.name}": TypeScript type expects ${expectedTypes.join(' or ')}, but drizzle column is "${columnType}"`;
  }
  return null;
}

/** Validates that nullability constraints match */
function validateNullability(prop: PropertyInfo, column: any): string | null {
  const isColumnNotNull = hasNotNullConstraint(column);
  if (prop.isOptional && isColumnNotNull)
    return `Property "${prop.name}" is optional in type but column has .notNull() constraint`;
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
  // Formats dispatch first (mirrors mapProperty): Temporal formats are class kinds and
  // structural formats are array/object kinds, so any later check would mis-file them
  if (prop.formatName) return expectedTypesByFormat[prop.formatName] ?? [];
  // A literal-union property lands on an enum-carrying text/varchar/mysqlEnum column
  if (prop.literalValues) return ['text', 'varchar', 'mysqlEnum', 'string'];
  // If it's a nested object or array, expect JSON types
  if (prop.isNestedObject || prop.isArray) return ['json', 'jsonb', 'text'];
  // Check primitive types
  if (prop.primitiveKind !== undefined) return getExpectedTypesForPrimitive(prop.primitiveKind);
  // Check for Date type
  const kind = prop.runType.kind;
  if (kind === RunTypeKind.class) {
    // Could be Date or other class
    const typeName = prop.runType.typeName;
    if (typeName === 'Date') return ['timestamp', 'date', 'datetime', 'integer', 'text'];
  }

  return [];
}

/** Expected column types per format, complete over FormatName (the old switch spelled
 *  'bigIntFormat' for the 'bigintFormat' name, so that check silently never fired). */
const expectedTypesByFormat: Record<FormatName, string[]> = {
  uuid: ['uuid', 'varchar', 'text', 'string'],
  email: ['text', 'varchar', 'string'],
  url: ['text', 'varchar', 'string'],
  domain: ['text', 'varchar', 'string'],
  ip: ['inet', 'varchar', 'text', 'string'],
  date: ['date', 'text', 'string'],
  time: ['time', 'text', 'string'],
  dateTime: ['timestamp', 'datetime', 'text', 'string'],
  stringFormat: ['text', 'varchar', 'char', 'string'],
  numberFormat: ['integer', 'int', 'smallint', 'bigint', 'real', 'double', 'doublePrecision', 'numeric', 'decimal', 'number'],
  bigintFormat: ['bigint', 'blob'],
  nativeDate: ['timestamp', 'date', 'datetime', 'integer', 'text'],
  temporalInstant: ['timestamp', 'text', 'string'],
  temporalZonedDateTime: ['text', 'varchar', 'string'],
  temporalPlainDate: ['date', 'text', 'string'],
  temporalPlainTime: ['time', 'text', 'string'],
  temporalPlainDateTime: ['timestamp', 'datetime', 'text', 'string'],
  temporalPlainYearMonth: ['varchar', 'text', 'string'],
  formattedArray: ['json', 'jsonb', 'text'],
  formattedObject: ['json', 'jsonb', 'text'],
};

/** Gets expected column types for a primitive kind */
function getExpectedTypesForPrimitive(kind: RunTypeKindValue): string[] {
  switch (kind) {
    case RunTypeKind.string:
      // 'string' is the dataType returned by drizzle for text-based columns
      return ['text', 'varchar', 'char', 'uuid', 'inet', 'string'];
    case RunTypeKind.number:
      // 'number' is the dataType returned by drizzle for numeric columns
      return ['integer', 'int', 'smallint', 'real', 'double', 'doublePrecision', 'numeric', 'decimal', 'number'];
    case RunTypeKind.boolean:
      return ['boolean', 'integer'];
    case RunTypeKind.bigint:
      return ['bigint', 'blob'];
    default:
      return [];
  }
}
