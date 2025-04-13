/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {StringFormat, FormatParams_String} from '../stringFormat.runtype';

// ############### Default String Formats ###############

export const ALPHANUMERIC_REGEX = /^[\p{L}\p{N}]+$/u;
export const ALPHA_REGEX = /^[\p{L}]+$/u;
export const NUMERIC_REGEX = /^[\p{N}]+$/u;

type DEFAULT_ALPHA_NUM_PARAMS = {
    pattern: {
        val: typeof ALPHANUMERIC_REGEX;
        mockSamples: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        reason: 'only alphanumeric values are allowed';
    };
};
type DEFAULT_ALPHA_PARAMS = {
    pattern: {
        val: typeof ALPHA_REGEX;
        mockSamples: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        reason: 'only alphabetic values are allowed';
    };
};
type DEFAULT_NUMERIC_PARAMS = {
    pattern: {
        val: typeof NUMERIC_REGEX;
        mockSamples: '0123456789';
        reason: 'only numeric values are allowed';
    };
};

export type String_Alphanumeric<P extends FormatParams_String = {}> = StringFormat<P & DEFAULT_ALPHA_NUM_PARAMS>;
export type String_Alpha<P extends FormatParams_String = {}> = StringFormat<P & DEFAULT_ALPHA_PARAMS>;
export type String_Numeric<P extends FormatParams_String = {}> = StringFormat<P & DEFAULT_NUMERIC_PARAMS>;
export type String_Lowercase<P extends FormatParams_String = {}> = StringFormat<P & {lowercase: true}>;
export type String_Uppercase<P extends FormatParams_String = {}> = StringFormat<P & {uppercase: true}>;
export type String_Capitalize<P extends FormatParams_String = {}> = StringFormat<P & {capitalize: true}>;
