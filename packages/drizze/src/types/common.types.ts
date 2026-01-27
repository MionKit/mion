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

/** Column mapping result from mapper */
export interface ColumnMapping {
    builder: any;
    drizzleType: string;
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
