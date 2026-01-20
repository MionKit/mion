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
    /** The full RunTypeError for access to expected, path, etc. */
    rtError: RunTypeError;
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

/** All possible string format error params (union of all string formats) */
export type FriendlyStringErrorParams = FriendlyErrorParams<AnyStringFormatParam>;
/** Number format error params */
export type FriendlyNumberErrorParams = FriendlyErrorParams<FormatParams_Number>;
/** BigInt format error params */
export type FriendlyBigIntErrorParams = FriendlyErrorParams<FormatParams_BigInt>;
/** Union of all friendly error params types, used at runtime */
export type AnyFriendlyErrorParams = FriendlyStringErrorParams | FriendlyNumberErrorParams | FriendlyBigIntErrorParams;

export type StringErrorParams = FriendlyErrorParams<StringParams>;
export type EmailErrorParams = FriendlyErrorParams<FormatParams_Email>;
export type UrlErrorParams = FriendlyErrorParams<FormatParams_Url>;
export type DomainErrorParams = FriendlyErrorParams<FormatParams_Domain>;
export type IPErrorParams = FriendlyErrorParams<FormatParams_IP>;
export type UUIDErrorParams = FriendlyErrorParams<FormatParams_UUID>;
export type DateTimeErrorParams = FriendlyErrorParams<FormatParams_DateTime>;
export type DateErrorParams = FriendlyErrorParams<FormatParams_Date>;
export type TimeErrorParams = FriendlyErrorParams<FormatParams_Time>;
export type NumberErrorParams = FriendlyNumberErrorParams;
export type BigIntErrorParams = FriendlyBigIntErrorParams;

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

/**
 * Handler function that receives error params and returns a friendly error message.
 * @param params - Object containing format params or $type for basic errors
 * @returns A human-readable error message string
 */
export type FriendlyErrorHandler<T> = (params: ExtractErrorParams<T>) => string;

// start-friendly-errors-type
/**
 * Maps object properties to error handlers.
 * Supports nested objects and arrays.
 */
export type FriendlyErrors<T> = {
    [K in keyof T]?: T[K] extends (infer U)[]
        ? FriendlyErrors<U> | FriendlyErrorHandler<U>
        : T[K] extends object
          ? FriendlyErrors<T[K]> | FriendlyErrorHandler<T[K]>
          : FriendlyErrorHandler<T[K]>;
};
// end-friendly-errors-type

// start-friendly-errors-result-type
/**
 * Result type for getFriendlyErrors.
 * Mirrors the structure of T but with string arrays for unique error messages.
 * Only properties with errors are included. Duplicate messages are automatically removed.
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
// end-friendly-errors-result-type
