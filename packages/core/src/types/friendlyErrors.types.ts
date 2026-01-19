/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RunTypeError, TypeFormatError, StrNumber} from './general.types';
import type {ExtractFormatParams} from './formats.types';
import type {
    AnyFormatParams,
    AnyStringFormatParam,
    FormatParams_BigInt,
    FormatParams_Number,
    StringParams,
    FormatParams_Email,
    FormatParams_Url,
    FormatParams_Domain,
    FormatParams_IP,
    FormatParams_UUID,
    FormatParams_DateTime,
    FormatParams_Date,
    FormatParams_Time,
} from './formatsParams.types';

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
 * Extracts all keys from a union type (distributive).
 * For a union `A | B | C`, returns `keyof A | keyof B | keyof C`.
 */
type UnionKeys<T> = T extends unknown ? keyof T : never;

/**
 * Maps format params to error params, extracting all possible keys from union types.
 */
export type FriendlyErrorParams<T extends AnyFormatParams> = {
    [K in UnionKeys<T>]?: TypeFormatError;
} & TypeErrorParam;

// ============================================================================
// Broad Error Params (union of all params for a base type)
// ============================================================================

/** All possible string format error params (union of all string formats) */
export type FriendlyStringErrorParams = FriendlyErrorParams<AnyStringFormatParam>;
/** Number format error params */
export type FriendlyNumberErrorParams = FriendlyErrorParams<FormatParams_Number>;
/** BigInt format error params */
export type FriendlyBigIntErrorParams = FriendlyErrorParams<FormatParams_BigInt>;
/** Union of all friendly error params types, used at runtime */
export type AnyFriendlyErrorParams = FriendlyStringErrorParams | FriendlyNumberErrorParams | FriendlyBigIntErrorParams;

// ============================================================================
// Specific String Format Error Params (for narrowing in handlers)
// ============================================================================

export type StringErrorParams = FriendlyErrorParams<StringParams>;
export type EmailErrorParams = FriendlyErrorParams<FormatParams_Email>;
export type UrlErrorParams = FriendlyErrorParams<FormatParams_Url>;
export type DomainErrorParams = FriendlyErrorParams<FormatParams_Domain>;
export type IPErrorParams = FriendlyErrorParams<FormatParams_IP>;
export type UUIDErrorParams = FriendlyErrorParams<FormatParams_UUID>;
export type DateTimeErrorParams = FriendlyErrorParams<FormatParams_DateTime>;
export type DateErrorParams = FriendlyErrorParams<FormatParams_Date>;
export type TimeErrorParams = FriendlyErrorParams<FormatParams_Time>;

/**
 * Extracts error params from a type T based on the base type.
 * - For string format types → FriendlyStringErrorParams
 * - For number format types → FriendlyNumberErrorParams
 * - For bigint format types → FriendlyBigIntErrorParams
 * - For basic types → TypeErrorParam
 *
 * The handler receives an object where keys are format param names (e.g., 'minLength')
 * and values are FormatErrorParam objects.
 */
export type ExtractErrorParams<T> =
    ExtractFormatParams<T> extends undefined
        ? TypeErrorParam // Basic type, no format params
        : T extends string
          ? FriendlyStringErrorParams
          : T extends number
            ? FriendlyNumberErrorParams
            : T extends bigint
              ? FriendlyBigIntErrorParams
              : TypeErrorParam;

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
