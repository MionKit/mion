/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitUtils} from '../lib/jitUtils';
// ############ IMPORTANT: RUN-TYPE FILES should not use type imports as will remove type information ############
import {StringCapitalizeTransformer, StringToLowercaseTransformer, StringToUppercaseTransformer} from '../transformers/string';
import {TypeFormat, TypeParams} from './typeFormat.runtypes';
import {
    StringAllowedCharsValidator,
    StringDisallowedCharsValidator,
    StringLengthValidator,
    StringMaxLengthValidator,
    StringMinLengthValidator,
    StringPatternValidator,
} from '../validators/string';
import {ALPHA_REGEX, ALPHANUMERIC_REGEX, NUMERIC_REGEX} from './regexp';


// ############ IMPORTANT: ALL TYPE FORMATS MUST REGISTER THEIR TYPE VALIDATORS ############
// Each validator property must match a validator  name
export type StringValidatorParams = {
    maxLength?: number;
    minLength?: number;
    length?: number;
    pattern?: RegExp;
    allowedChars?: string;
    disallowedChars?: string;
};

// ############ IMPORTANT: ALL TYPE FORMATS MUST REGISTER THEIR TYPE TRANSFORMERS ############
// Each format property must match a transformer name
export type StringTransformParams = {
    lowercase?: boolean;
    uppercase?: boolean;
    capitalize?: boolean;
    unCapitalize?: boolean;
};

// String type annotations (property names must match validator names)
export type StringParams = TypeParams & StringValidatorParams & StringTransformParams;
export type StringFormat<P extends StringParams> = TypeFormat<string, 'string', P>;

export type Alpha = StringFormat<{pattern: typeof ALPHA_REGEX}>;
export type AlphaNumeric = StringFormat<{pattern: typeof ALPHANUMERIC_REGEX}>;
export type Numeric = StringFormat<{pattern: typeof NUMERIC_REGEX}>;
export type Lower = StringFormat<{lowercase: true}>;
export type Upper = StringFormat<{uppercase: true}>;
export type Capital = StringFormat<{capitalize: true}>;
export type UnCapital = StringFormat<{unCapitalize: true}>;

// Date and Time

export type StringDateTime = StringFormat<{validator: 'vf_isDateTime'}>;
export type StringDate = StringFormat<{validator: 'vf_isDate'}>;
export type StringTime = StringFormat<{validator: 'vf_isTime'}>;

// Internet
export type Email<MaxL extends number = 256, AllowedLocalChars extends string = any> = StringFormat<{
    validator: 'vf_isEmail';
    maxLength: MaxL;
    minLocalLength: 6;
    allowedLocalChars: AllowedLocalChars;
    toLowercase: true;
}>;
export type Domain = StringFormat<{validator: 'vf_isDomain'; maxLength: 253}>;
export type StringUrl<N extends number = 2048> = StringFormat<{maxLength: N; validator: 'vf_isURL'}>;
export type Phone = StringFormat<{validator: 'vf_isPhone'}>;
export type IP = StringFormat<{validator: 'vf_isIP'}>;
export type IPV4 = StringFormat<{validator: 'vf_isIPv4'}>;
export type IPV6 = StringFormat<{validator: 'vf_isIPv6'}>;
export type IPRange = StringFormat<{validator: 'vf_isIPRange'}>;

// IDs
export type UUID = StringFormat<{validator: 'vf_isUUID'}>;

// register Validator operations so they can be used in the jit compiler
jitUtils.registerBrandedTypeOperation(new StringMaxLengthValidator());
jitUtils.registerBrandedTypeOperation(new StringMinLengthValidator());
jitUtils.registerBrandedTypeOperation(new StringLengthValidator());
jitUtils.registerBrandedTypeOperation(new StringPatternValidator());
jitUtils.registerBrandedTypeOperation(new StringAllowedCharsValidator());
jitUtils.registerBrandedTypeOperation(new StringDisallowedCharsValidator());

// register Transformer operations so they can be used in the jit compiler
jitUtils.registerBrandedTypeOperation(new StringToLowercaseTransformer());
jitUtils.registerBrandedTypeOperation(new StringToUppercaseTransformer());
jitUtils.registerBrandedTypeOperation(new StringCapitalizeTransformer());
jitUtils.registerBrandedTypeOperation(new StringCapitalizeTransformer());
