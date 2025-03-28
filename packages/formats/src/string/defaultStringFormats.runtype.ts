/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {StringFormat, StringFormatParams} from './stringFormat.runtype';

// ############### Default String Formats ###############

export const ALPHANUMERIC_REGEX = /^[\p{L}\p{N}]+$/u;
export const ALPHA_REGEX = /^[\p{L}]+$/u;
export const NUMERIC_REGEX = /^[\p{N}]+$/u;

type DefaultAlphaNumericParams = {
    pattern: {
        regexp: typeof ALPHANUMERIC_REGEX;
        sampleChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        message: 'only alphanumeric values are allowed';
    };
};
type DefaultAlphaParams = {
    pattern: {
        regexp: typeof ALPHA_REGEX;
        sampleChars: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        message: 'only alphabetic values are allowed';
    };
};
type DefaultNumericParams = {
    pattern: {regexp: typeof NUMERIC_REGEX; sampleChars: '0123456789'; message: 'only numeric values are allowed'};
};

export type AlphaNumericString<P extends StringFormatParams = {}> = StringFormat<P & DefaultAlphaNumericParams>;
export type AlphaString<P extends StringFormatParams = {}> = StringFormat<P & DefaultAlphaParams>;
export type NumericString<P extends StringFormatParams = {}> = StringFormat<P & DefaultNumericParams>;
export type LowerString<P extends StringFormatParams = {}> = StringFormat<P & {lowercase: true}>;
export type UpperString<P extends StringFormatParams = {}> = StringFormat<P & {uppercase: true}>;
export type CapitalString<P extends StringFormatParams = {}> = StringFormat<P & {capitalize: true}>;
