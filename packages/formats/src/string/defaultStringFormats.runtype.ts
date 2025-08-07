/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {StrFormat, StringParams} from './stringFormat.runtype';

// ############### Default String Formats ###############

export const ALPHANUMERIC_REGEX = /^[\p{L}\p{N}]+$/u;
export const ALPHA_REGEX = /^[\p{L}]+$/u;
export const NUMERIC_REGEX = /^[\p{N}]+$/u;

type DEFAULT_ALPHA_NUM_PARAMS = {
    pattern: {
        val: typeof ALPHANUMERIC_REGEX;
        mockSamples: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        errorMessage: 'only alphanumeric values are allowed';
    };
};
type DEFAULT_ALPHA_PARAMS = {
    pattern: {
        val: typeof ALPHA_REGEX;
        mockSamples: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        errorMessage: 'only alphabetic values are allowed';
    };
};
type DEFAULT_NUMERIC_PARAMS = {
    pattern: {
        val: typeof NUMERIC_REGEX;
        mockSamples: '0123456789';
        errorMessage: 'only numeric values are allowed';
    };
};

export type StrAlphaNumeric<P extends StringParams = {}> = StrFormat<P & DEFAULT_ALPHA_NUM_PARAMS>;
export type StrAlpha<P extends StringParams = {}> = StrFormat<P & DEFAULT_ALPHA_PARAMS>;
export type StrNumeric<P extends StringParams = {}> = StrFormat<P & DEFAULT_NUMERIC_PARAMS>;
export type StrLowercase<P extends StringParams = {}> = StrFormat<P & {lowercase: true}>;
export type StrUppercase<P extends StringParams = {}> = StrFormat<P & {uppercase: true}>;
export type StrCapitalize<P extends StringParams = {}> = StrFormat<P & {capitalize: true}>;
