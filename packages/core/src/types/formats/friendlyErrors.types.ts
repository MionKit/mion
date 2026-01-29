/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RunTypeError, StrNumber} from '../general.types';
import {
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
import {ExtractFormatParams, TypeFormatError} from './formats.types';
import {BrandEmail, BrandUUID, BrandUrl, BrandDomain, BrandIP, BrandDate, BrandTime, BrandDateTime} from './formatBrands.types';

/**
 * Special key for basic type errors (when no format is involved).
 * Contains the full RunTypeError for access to expected, path, etc.
 */
export type TypeErrorParam = {
    /** The full RunTypeError for access to expected, path, etc. (last error if multiple) */
    rtError: RunTypeError;
    /** All RunTypeErrors for this field (aggregated from all validation failures) */
    rtErrors: RunTypeError[];
    /** The name of the property that failed validation */
    propName: string | number;
    /** The index of the property that failed validation, used for arrays */
    index?: number;
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

export type StringErrorParams = FriendlyErrorParams<StringParams>;
export type EmailErrorParams = FriendlyErrorParams<FormatParams_Email>;
export type UrlErrorParams = FriendlyErrorParams<FormatParams_Url>;
export type DomainErrorParams = FriendlyErrorParams<FormatParams_Domain>;
export type IPErrorParams = FriendlyErrorParams<FormatParams_IP>;
export type UUIDErrorParams = FriendlyErrorParams<FormatParams_UUID>;
export type DateTimeErrorParams = FriendlyErrorParams<FormatParams_DateTime>;
export type DateErrorParams = FriendlyErrorParams<FormatParams_Date>;
export type TimeErrorParams = FriendlyErrorParams<FormatParams_Time>;
export type NumberErrorParams = FriendlyErrorParams<FormatParams_Number>;
export type BigIntErrorParams = FriendlyErrorParams<FormatParams_BigInt>;

/** Union of all friendly error params types, used at runtime */
export type AnyFriendlyErrorParams =
    | FriendlyErrorParams<AnyStringFormatParam>
    | FriendlyErrorParams<FormatParams_Number>
    | FriendlyErrorParams<FormatParams_BigInt>;

/**
 * Extracts error params from a type T based on the branded type.
 * - For branded string types → specific error params (EmailErrorParams, UUIDErrorParams, etc.)
 * - For plain string with format → FriendlyStringErrorParams (union of all)
 * - For number format types → FriendlyNumberErrorParams
 * - For bigint format types → FriendlyBigIntErrorParams
 * - For basic types → TypeErrorParam
 *
 * The handler receives an object where keys are format param names (e.g., 'minLength')
 * and values are TypeFormatError objects.
 */
export type ExtractErrorParams<T> =
    ExtractFormatParams<T> extends undefined
        ? TypeErrorParam // Basic type, no format params
        : T extends BrandEmail
          ? EmailErrorParams
          : T extends BrandUUID
            ? UUIDErrorParams
            : T extends BrandUrl
              ? UrlErrorParams
              : T extends BrandDomain
                ? DomainErrorParams
                : T extends BrandIP
                  ? IPErrorParams
                  : T extends BrandDateTime
                    ? DateTimeErrorParams
                    : T extends BrandDate
                      ? DateErrorParams
                      : T extends BrandTime
                        ? TimeErrorParams
                        : T extends string
                          ? StringErrorParams
                          : T extends number
                            ? NumberErrorParams
                            : T extends bigint
                              ? BigIntErrorParams
                              : TypeErrorParam;

/**
 * Handler function that receives error params and returns a friendly error message.
 * @param params - Object containing format params or $type for basic errors
 * @returns A human-readable error message string
 */
export type FriendlyErrorHandler<T> = (params: ExtractErrorParams<T>) => string;

// ============================================================================
// Map and Set Error Handler Types
// ============================================================================

/**
 * Error handlers for Map types.
 * Supports separate handlers for key and value validation errors.
 */
export type MapErrorHandlers<K, V> = {
    /** Handler for key validation errors */
    $key?: FriendlyErrorHandler<K>;
    /** Handler or nested map for value validation errors */
    $value?: FriendlyErrors<V> | FriendlyErrorHandler<V>;
};

/**
 * Error handlers for Set types.
 * Supports handler for item validation errors.
 */
export type SetErrorHandlers<T> = {
    /** Handler or nested map for item validation errors */
    $item?: FriendlyErrors<T> | FriendlyErrorHandler<T>;
};

// start-friendly-errors-type
/**
 * Maps object properties to error handlers.
 * Supports nested objects, arrays, Maps, Sets, and top-level types.
 *
 * @example Top-level array of primitives
 * ```typescript
 * type Tags = string[];
 * const errorsMap: FriendlyErrors<Tags> = (params) => `Item ${params.index} is invalid`;
 * ```
 *
 * @example Top-level array of objects
 * ```typescript
 * type Users = User[];
 * const errorsMap: FriendlyErrors<Users> = {
 *     name: (params) => 'Name required',
 *     email: (params) => 'Email required'
 * };
 * ```
 *
 * @example Map with separate handlers
 * ```typescript
 * type UserMap = Map<string, User>;
 * const errorsMap: FriendlyErrors<UserMap> = {
 *     $key: (params) => 'Invalid user ID',
 *     $value: { name: (params) => 'Name required' }
 * };
 * ```
 *
 * @example Set with handler
 * ```typescript
 * type TagSet = Set<string>;
 * const errorsMap: FriendlyErrors<TagSet> = {
 *     $item: (params) => `Tag at index ${params.index} is invalid`
 * };
 * ```
 */
export type FriendlyErrors<T> =
    // Top-level array of primitives: allow handler function
    T extends (infer U)[]
        ? U extends object
            ? FriendlyErrors<U> | FriendlyErrorHandler<U> // Array of objects: nested map or handler
            : FriendlyErrorHandler<U> // Array of primitives: handler only
        : // Top-level Map: allow handlers for key/value or single handler
          T extends Map<infer K, infer V>
          ? MapErrorHandlers<K, V> | FriendlyErrorHandler<V>
          : // Top-level Set: allow handlers for items or single handler
            T extends Set<infer U>
            ? SetErrorHandlers<U> | FriendlyErrorHandler<U>
            : // Object type: map properties to handlers
              {
                  [P in keyof T]?: T[P] extends (infer U)[]
                      ? U extends object
                          ? FriendlyErrors<U> | FriendlyErrorHandler<U>
                          : FriendlyErrorHandler<U>
                      : T[P] extends Map<infer K, infer V>
                        ? MapErrorHandlers<K, V> | FriendlyErrorHandler<V>
                        : T[P] extends Set<infer U>
                          ? SetErrorHandlers<U> | FriendlyErrorHandler<U>
                          : T[P] extends object
                            ? FriendlyErrors<T[P]> | FriendlyErrorHandler<T[P]>
                            : FriendlyErrorHandler<T[P]>;
              };
// end-friendly-errors-type

// ============================================================================
// Map and Set Result Types
// ============================================================================

/**
 * Result type for Map errors.
 * Contains separate records for key and value errors, indexed by position.
 * @template _K - Key type (unused but kept for type inference consistency)
 * @template V - Value type
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type MapErrorsResult<_K, V> = {
    /** Key errors indexed by position in the Map */
    $keys?: Record<StrNumber, string>;
    /** Value errors indexed by position in the Map */
    $values?: Record<StrNumber, V extends object ? FriendlyErrorsResult<V> : string>;
};

/**
 * Result type for Set errors.
 * Contains errors indexed by position in the Set.
 */
export type SetErrorsResult<T> = Record<StrNumber, T extends object ? FriendlyErrorsResult<T> : string>;

// start-friendly-errors-result-type
/**
 * Result type for getFriendlyErrors.
 * Mirrors the structure of T but with single string error messages per field.
 * Only properties with errors are included.
 * Each handler is called once per field with all aggregated error params.
 *
 * For arrays: Returns Record<StrNumber, string> where keys are the indices that failed.
 * For Maps: Returns { $keys?: Record<StrNumber, string>, $values?: Record<StrNumber, string | nested> }
 * For Sets: Returns Record<StrNumber, string | nested> where keys are the indices that failed.
 * For objects: Returns nested FriendlyErrorsResult.
 * For primitives: Returns string.
 */
export type FriendlyErrorsResult<T> =
    // Array: Record of index -> error message or nested result
    T extends (infer U)[]
        ? Record<StrNumber, U extends object ? FriendlyErrorsResult<U> : string>
        : // Map: Separate key and value error records
          T extends Map<infer K, infer V>
          ? MapErrorsResult<K, V>
          : // Set: Record of index -> error message or nested result
            T extends Set<infer U>
            ? SetErrorsResult<U>
            : // Object: Nested structure
              T extends object
              ? {
                    [P in keyof T]?: T[P] extends (infer U)[]
                        ? Record<StrNumber, U extends object ? FriendlyErrorsResult<U> : string>
                        : T[P] extends Map<infer K, infer V>
                          ? MapErrorsResult<K, V>
                          : T[P] extends Set<infer U>
                            ? SetErrorsResult<U>
                            : T[P] extends object
                              ? FriendlyErrorsResult<T[P]>
                              : string;
                } & {
                    /** Root level errors (when path is empty) */
                    $root?: string;
                }
              : string;
// end-friendly-errors-result-type
