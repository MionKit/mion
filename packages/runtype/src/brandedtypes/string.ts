/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BrandedType, TypeParams} from '../types';
import {stringMaxLengthValidator} from '../validators/string';
import {ALPHA_REGEX, ALPHANUMERIC_REGEX, NUMERIC_REGEX} from './regexp';

// String
export type StringParams = {
    maxLength?: number;
    minLength?: number;
    length?: number;
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
    unCapitalize?: boolean;
    regexp?: RegExp;
} & TypeParams;

export type StringFormat<P extends StringParams> = BrandedType<string, 'string', P>;

export type Alpha = StringFormat<{regexp: typeof ALPHA_REGEX}>;
export type AlphaNumeric = StringFormat<{regexp: typeof ALPHANUMERIC_REGEX}>;
export type Numeric = StringFormat<{regexp: typeof NUMERIC_REGEX}>;
export type Lower = StringFormat<{lowercase: true}>;
export type Upper = StringFormat<{capitalize: true}>;
export type Capital = StringFormat<{capitalize: true}>;
export type UnCapital = StringFormat<{unCapitalize: true}>;

// Date and Time

export type DateTime = StringFormat<{validatorName: 'vf_isDateTime'}>;
export type Date = StringFormat<{validatorName: 'vf_isDate'}>;
export type Time = StringFormat<{validatorName: 'vf_isTime'}>;

// Internet
export type Email<MaxL extends number = 256, AllowedLocalChars extends string = any> = StringFormat<{
    validatorName: 'vf_isEmail';
    maxLength: MaxL;
    minLocalLength: 6;
    allowedLocalChars: AllowedLocalChars;
}>;
export type Domain = StringFormat<{validatorName: 'vf_isDomain'; maxLength: 253}>;
export type Url<N extends number = 2048> = StringFormat<{maxLength: N; validatorName: 'vf_isURL'}>;
export type Phone = StringFormat<{validatorName: 'vf_isPhone'}>;
export type Ip = StringFormat<{validatorName: 'vf_isIP'}>;
export type IpV4 = StringFormat<{validatorName: 'vf_isIPv4'}>;
export type IpV6 = StringFormat<{validatorName: 'vf_isIPv6'}>;
export type IpRange = StringFormat<{validatorName: 'vf_isIPRange'}>;

// IDs
export type UUID = StringFormat<{validatorName: 'vf_isUUID'}>;

stringMaxLengthValidator;
