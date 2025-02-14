/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitUtils} from '../lib/jitUtils';
import {BrandedType, TypeParams} from '../types';
import {
    stringLengthValidator,
    stringMaxLengthValidator,
    stringMinLengthValidator,
    stringPatternValidator,
} from '../validators/string';
import {ALPHA_REGEX, ALPHANUMERIC_REGEX, NUMERIC_REGEX} from './regexp';

// register operations so they can be used in the jit compiler
jitUtils.registerTypeOperation(stringMaxLengthValidator.kind, stringMaxLengthValidator);
jitUtils.registerTypeOperation(stringMinLengthValidator.kind, stringMinLengthValidator);
jitUtils.registerTypeOperation(stringLengthValidator.kind, stringLengthValidator);
jitUtils.registerTypeOperation(stringPatternValidator.kind, stringPatternValidator);

// String type annotations (property names must match validator names)
export type StringParams = {
    maxLength?: number;
    minLength?: number;
    length?: number;
    pattern?: RegExp;

    // transformers
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
    unCapitalize?: boolean;
} & TypeParams;

export type StringFormat<P extends StringParams> = BrandedType<string, 'string', P>;

export type Alpha = StringFormat<{pattern: typeof ALPHA_REGEX}>;
export type AlphaNumeric = StringFormat<{pattern: typeof ALPHANUMERIC_REGEX}>;
export type Numeric = StringFormat<{pattern: typeof NUMERIC_REGEX}>;
export type Lower = StringFormat<{lowercase: true}>;
export type Upper = StringFormat<{capitalize: true}>;
export type Capital = StringFormat<{capitalize: true}>;
export type UnCapital = StringFormat<{unCapitalize: true}>;

// Date and Time

export type DateTime = StringFormat<{validator: 'vf_isDateTime'}>;
export type Date = StringFormat<{validator: 'vf_isDate'}>;
export type Time = StringFormat<{validator: 'vf_isTime'}>;

// Internet
export type Email<MaxL extends number = 256, AllowedLocalChars extends string = any> = StringFormat<{
    validator: 'vf_isEmail';
    maxLength: MaxL;
    minLocalLength: 6;
    allowedLocalChars: AllowedLocalChars;
}>;
export type Domain = StringFormat<{validator: 'vf_isDomain'; maxLength: 253}>;
export type Url<N extends number = 2048> = StringFormat<{maxLength: N; validator: 'vf_isURL'}>;
export type Phone = StringFormat<{validator: 'vf_isPhone'}>;
export type Ip = StringFormat<{validator: 'vf_isIP'}>;
export type IpV4 = StringFormat<{validator: 'vf_isIPv4'}>;
export type IpV6 = StringFormat<{validator: 'vf_isIPv6'}>;
export type IpRange = StringFormat<{validator: 'vf_isIPRange'}>;

// IDs
export type UUID = StringFormat<{validator: 'vf_isUUID'}>;
