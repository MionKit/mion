/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {FormatParam, RunTypeError, TypeFormatValue} from './general.types';

// TypeFormatError

// ============================================================================
// Format Errors
// ============================================================================

/**
 * Base error params with the full RunTypeError.
 */
export interface BaseErrorParams {
    /** The full RunTypeError for access to expected, path, etc. */
    $type?: RunTypeError;
}

// ============================================================================
// Format Params
// ============================================================================

export type Samples = string | readonly string[];
export interface StringFormatParams {
    // index signature required by TypeFormatParams
    [key: string]: TypeFormatValue | undefined;
    // validators
    maxLength?: number | {val: number; errorMessage: string; desc?: string};
    minLength?: number | {val: number; errorMessage: string; desc?: string};
    length?: number | {val: number; errorMessage: string; desc?: string};
    disallowedChars?: {val: string; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples: string};
    disallowedValues?: {val: readonly string[]; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples: Samples};
    pattern?: {val: RegExp; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples: Samples};
    allowedChars?: {val: string; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples?: Samples};
    allowedValues?: {val: readonly string[]; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples?: Samples};
}
export type StringTransformers = {
    // formatters
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
    trim?: boolean;
    replace?: {searchValue: string; replaceValue: string};
    replaceAll?: {searchValue: string; replaceValue: string};
};
export type StringParams = StringFormatParams & StringTransformers;

// -------------

export interface FormatParams_UUID {
    [key: string]: TypeFormatValue | undefined;
    version: FormatParam<'4' | '7'>;
}

// -------------

export type TimeFmt = 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
export interface FormatParams_Time {
    [key: string]: TypeFormatValue | undefined;
    format: FormatParam<TimeFmt>;
}
export interface FormatParams_IP {
    [key: string]: TypeFormatValue | undefined;
    version: FormatParam<4 | 6 | 'any'>;
    /** Allows localhost values ie: localhost, 127.0.0.1, 0::1 */
    allowLocalHost?: FormatParam<boolean>;
    // TODO: allow port
    allowPort?: FormatParam<boolean>;
}
