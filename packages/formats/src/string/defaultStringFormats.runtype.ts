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
        regexp: typeof ALPHANUMERIC_REGEX;
        sampleChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        message: 'only alphanumeric values are allowed';
    };
};
type DEFAULT_ALPHA_PARAMS = {
    pattern: {
        regexp: typeof ALPHA_REGEX;
        sampleChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        message: 'only alphabetic values are allowed';
    };
};
type DEFAULT_NUMERIC_PARAMS = {
    pattern: {
        regexp: typeof NUMERIC_REGEX;
        sampleChars: '0123456789';
        message: 'only numeric values are allowed';
    };
};

export type StringFormat_Alphanumeric<P extends FormatParams_String = {}> = StringFormat<P & DEFAULT_ALPHA_NUM_PARAMS>;
export type StringFormat_Alpha<P extends FormatParams_String = {}> = StringFormat<P & DEFAULT_ALPHA_PARAMS>;
export type StringFormat_Numeric<P extends FormatParams_String = {}> = StringFormat<P & DEFAULT_NUMERIC_PARAMS>;
export type StringFormat_Lowercase<P extends FormatParams_String = {}> = StringFormat<P & {lowercase: true}>;
export type StringFormat_Uppercase<P extends FormatParams_String = {}> = StringFormat<P & {uppercase: true}>;
export type StringFormat_Capitalize<P extends FormatParams_String = {}> = StringFormat<P & {capitalize: true}>;
