/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RunTypeKind} from '@mionjs/run-types';
import type {RunTypeKindValue} from '@mionjs/run-types';
import type {PropertyInfo} from '../types/common.types.ts';

/** Converts a camelCase property name to snake_case for database column names */
export function toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Checks if a property should be stored as JSON (nested object or array) */
export function shouldBeJson(prop: PropertyInfo): boolean {
    return prop.isNestedObject || prop.isArray;
}

/** Gets the format param value, handling both simple values and objects with val property */
export function getParamValue<T>(param: T | {val: T}): T {
    if (param && typeof param === 'object' && 'val' in param) {
        return param.val;
    }
    return param as T;
}

/** Checks if a type is a Date class */
export function isDateClass(kind: RunTypeKindValue, typeName?: string): boolean {
    return kind === RunTypeKind.class && typeName === 'Date';
}

/** Gets the max length from format params if available */
export function getMaxLengthFromParams(formatParams?: Record<string, any>): number | undefined {
    if (!formatParams) return undefined;
    const maxLength = formatParams.maxLength;
    return maxLength ? getParamValue(maxLength) : undefined;
}

/** Gets the exact length from format params if available */
export function getLengthFromParams(formatParams?: Record<string, any>): number | undefined {
    if (!formatParams) return undefined;
    const length = formatParams.length;
    return length ? getParamValue(length) : undefined;
}

/** Checks if a number format specifies integer constraint */
export function isIntegerFormat(formatParams?: Record<string, any>): boolean {
    if (!formatParams) return false;
    return !!getParamValue(formatParams.integer);
}

/** Checks if a number format specifies float constraint */
export function isFloatFormat(formatParams?: Record<string, any>): boolean {
    if (!formatParams) return false;
    return !!getParamValue(formatParams.float);
}
