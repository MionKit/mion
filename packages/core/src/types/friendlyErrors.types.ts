/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunTypeError, TypeFormatError, StrNumber} from './general.types';
import type {ExtractFormatParams} from './formats.types';

// ============================================================================
// Error Params Types
// ============================================================================

/**
 * Represents a single format error parameter.
 * Contains the format error info from RunTypeError.format.
 */
export type FormatErrorParam = TypeFormatError;

/**
 * Special key for basic type errors (when no format is involved).
 * Contains the full RunTypeError for access to expected, path, etc.
 */
export type TypeErrorParam = {
    $type: RunTypeError;
};

/**
 * Extracts error params from a type T.
 * For format types, extracts the format params (minLength, maxLength, min, max, etc.)
 * For basic types, provides $type with the full error.
 *
 * The handler receives an object where keys are format param names (e.g., 'minLength')
 * and values are FormatErrorParam objects.
 */
export type ExtractErrorParams<T> =
    ExtractFormatParams<T> extends infer P
        ? P extends undefined
            ? TypeErrorParam & Record<string, FormatErrorParam | undefined>
            : {[K in keyof P]?: FormatErrorParam} & TypeErrorParam
        : TypeErrorParam & Record<string, FormatErrorParam | undefined>;

// ============================================================================
// Friendly Errors Handler Types
// ============================================================================

/**
 * Handler function that receives error params and returns a friendly error message.
 * @param params - Object containing format params or $type for basic errors
 * @returns A human-readable error message string
 */
export type FriendlyErrorHandler<T> = (params?: ExtractErrorParams<T>) => string;

/**
 * Maps object properties to error handlers.
 * Supports nested objects and arrays.
 *
 * @example
 * type User = { name: string; age: number; address: { city: string } };
 * const errorsMap: FriendlyErrors<User> = {
 *   name: (params) => `Name is invalid: ${params?.$type?.expected}`,
 *   age: (params) => `Age must be ${params?.min?.val} or more`,
 *   address: {
 *     city: () => 'City is required',
 *   },
 * };
 */
export type FriendlyErrors<T> = {
    [K in keyof T]?: T[K] extends (infer U)[]
        ? FriendlyErrors<U> | FriendlyErrorHandler<U>
        : T[K] extends object
          ? FriendlyErrors<T[K]> | FriendlyErrorHandler<T[K]>
          : FriendlyErrorHandler<T[K]>;
};

// ============================================================================
// Friendly Errors Result Types
// ============================================================================

/**
 * Result type for getFriendlyErrors.
 * Mirrors the structure of T but with string arrays for error messages.
 * Only properties with errors are included.
 *
 * @example
 * type User = { name: string; age: number };
 * // Result might be: { name: ['Name is required'], age: ['Must be 18+'] }
 */
export type FriendlyErrorsResult<T> = {
    [K in keyof T]?: T[K] extends (infer U)[]
        ? FriendlyErrorsResult<U> | Record<StrNumber, string[]>
        : T[K] extends object
          ? FriendlyErrorsResult<T[K]>
          : string[];
} & {
    /** Root level errors (when path is empty) */
    $root?: string[];
};
