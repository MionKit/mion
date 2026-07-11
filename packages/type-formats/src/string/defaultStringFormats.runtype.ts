/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FormatString} from './stringFormat.runtype.ts';
import {StringParams} from '@mionjs/core';

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

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type FormatAlphaNumeric<P extends StringParams = {}> = FormatString<P & DEFAULT_ALPHA_NUM_PARAMS>;
export type FormatAlpha<P extends StringParams = {}> = FormatString<P & DEFAULT_ALPHA_PARAMS>;
export type FormatNumeric<P extends StringParams = {}> = FormatString<P & DEFAULT_NUMERIC_PARAMS>;
export type FormatLowercase<P extends StringParams = {}> = FormatString<P & {lowercase: true}>;
export type FormatUppercase<P extends StringParams = {}> = FormatString<P & {uppercase: true}>;
export type FormatCapitalize<P extends StringParams = {}> = FormatString<P & {capitalize: true}>;
