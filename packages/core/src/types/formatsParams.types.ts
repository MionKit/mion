/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {FormatParam} from './general.types';
// ############### String Format Params ###############

// TypeFormatError

// #### Strings ####
export type Samples = string | readonly string[];
export type StringValidators = {
    // validators
    maxLength?: number | {val: number; errorMessage: string; desc?: string};
    minLength?: number | {val: number; errorMessage: string; desc?: string};
    length?: number | {val: number; errorMessage: string; desc?: string};
    disallowedChars?: {val: string; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples: string};
    disallowedValues?: {val: readonly string[]; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples: Samples};
    pattern?: {val: RegExp; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples: Samples};
    allowedChars?: {val: string; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples?: Samples};
    allowedValues?: {val: readonly string[]; errorMessage: string; desc?: string; ignoreCase?: boolean; mockSamples?: Samples};
};
export type StringTransformers = {
    // formatters
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
    trim?: boolean;
    replace?: {searchValue: string; replaceValue: string};
    replaceAll?: {searchValue: string; replaceValue: string};
};
export type StringParams = StringValidators & StringTransformers;

// #### Date ####
export type DateFmt = 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'MM-DD' | 'DD-MM' | 'YYYY-MM';
export type FormatParams_Date = {
    format: FormatParam<DateFmt>;
};

// #### Time ####
export type TimeFmt = 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
export type FormatParams_Time = {format: FormatParam<TimeFmt>};

// #### DateTime ####
export type FormatParams_DateTime = {
    date: FormatParams_Date;
    time: FormatParams_Time;
    splitChar: FormatParam<string>;
};

// #### Emails ####
export type FormatParams_EmailPattern = Omit<StringValidators, 'length' | 'allowedChars' | 'disallowedChars' | 'allowedValues'>;
export type FormatParams_Email = FormatParams_EmailPattern & {
    localPart?: StringValidators;
    domain?: FormatParams_Domain;
};

// #### URL ####
export type FormatParams_UrlPattern = Omit<
    StringParams,
    'allowedChars' | 'disallowedChars' | 'allowedValues' | 'disallowedValues'
>;
export type FormatParams_Url = FormatParams_UrlPattern & {ip?: FormatParams_IP; domain?: FormatParams_Domain};

// #### Domains ####
export type FormatParams_DomainName = Omit<StringValidators, 'length' | 'allowedChars' | 'disallowedChars'>;
export type FormatParams_Tld = Omit<StringValidators, 'length' | 'allowedChars' | 'disallowedChars'>;
export type FormatParam_Pattern = StringValidators['pattern'];
export type FormatParams_DomainCore =
    | {names?: never; tld?: never; pattern: FormatParam_Pattern}
    | {names: FormatParams_DomainName; tld: FormatParams_Tld; pattern?: never};
export type FormatParams_Domain = {
    maxLength?: FormatParam<number>;
    minLength?: FormatParam<number>;
    maxParts?: FormatParam<number>;
    minParts?: FormatParam<number>;
} & FormatParams_DomainCore;

// #### IP ####
export type FormatParams_IP = {
    version: FormatParam<4 | 6 | 'any'>;
    /** Allows localhost values ie: localhost, 127.0.0.1, 0::1 */
    allowLocalHost?: FormatParam<boolean>;
    // TODO: allow port
    allowPort?: FormatParam<boolean>;
};

// #### UUID ####
export type FormatParams_UUID = {version: FormatParam<'4' | '7'>};

// ############### Number Format Params ###############
type NumberMax =
    | {max?: number | {val: number; errorMessage: string; desc?: string}; gt?: never}
    | {max?: never; gt?: number | {val: number; errorMessage: string; desc?: string}};
type NumberMin =
    | {min?: number | {val: number; errorMessage: string; desc?: string}; lt?: never}
    | {min?: never; lt?: number | {val: number; errorMessage: string; desc?: string}};
type NumberType =
    | {integer?: boolean | {val: boolean; errorMessage: string; desc?: string}; float?: never}
    | {integer?: never; float?: boolean | {val: boolean; errorMessage: string; desc?: string}};
export type FormatParams_Number = NumberMax &
    NumberMin &
    NumberType & {
        multipleOf?: number | {val: number; errorMessage: string; desc?: string};
    };

// ############### BigInt Format Params ###############
type BigIntMax =
    | {max?: bigint | {val: bigint; errorMessage: string; desc?: string}; gt?: never}
    | {max?: never; gt?: bigint | {val: bigint; errorMessage: string; desc?: string}};
type BigIntMin =
    | {min?: bigint | {val: bigint; errorMessage: string; desc?: string}; lt?: never}
    | {min?: never; lt?: bigint | {val: bigint; errorMessage: string; desc?: string}};
export type FormatParams_BigInt = BigIntMax &
    BigIntMin & {
        multipleOf?: bigint | {val: bigint; errorMessage: string; desc?: string};
    };

// ############### All string formats ###############

export type AnyStringFormatParam =
    | StringParams // string
    | FormatParams_Email // email
    | FormatParams_Url // url
    | FormatParams_Domain // domain
    | FormatParams_IP // ip
    | FormatParams_UUID // uuid
    | FormatParams_DateTime // date-time
    | FormatParams_Date // date
    | FormatParams_Time; // time

export type AnyFormatParams = AnyStringFormatParam | FormatParams_Number | FormatParams_BigInt;
