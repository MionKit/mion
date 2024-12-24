/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ALPHA_REGEX, ALPHANUMERIC_REGEX, NUMERIC_REGEX} from './regexp';

// String
export type Length<N extends number> = {length: N};
export type MaxLength<N extends number> = {maxLength: N};
export type MinLength<N extends number> = {minLength: N};
export type Pattern<R extends RegExp> = {regexp: R};
export type Alpha = {regexp: typeof ALPHA_REGEX};
export type AlphaNumeric = {regexp: typeof ALPHANUMERIC_REGEX};
export type Numeric = {regexp: typeof NUMERIC_REGEX};
export type Lower = {lower: true};
export type Upper = {upper: true};
export type Capital = {capitalize: true};
export type UnCapital = {unCapitalize: true};

// Date and Time

export type DateTime = {validator: 'vf_isDateTime'};
export type Date = {validator: 'vf_isDate'};
export type Time = {validator: 'vf_isTime'};

// Internet
export type Email<N extends number = 256, AllowedChars extends string = any> = {
    validator: 'vf_isEmail';
    allowedChars: AllowedChars;
    maxLength: N;
};
export type Domain = {validator: 'vf_isDomain'};
export type Url<N extends number = 2048> = {maxLength: N; validator: 'vf_isURL'};
export type Phone = {validator: 'vf_isPhone'};
export type Ip = {validator: 'vf_isIP'};
export type IpV4 = {validator: 'vf_isIPv4'};
export type IpV6 = {validator: 'vf_isIPv6'};
export type IpRange = {validator: 'vf_isIPRange'};

// IDs
export type UUID = {validator: 'vf_isUUID'};

export type StringFormatParam =
    | MaxLength<number>
    | MinLength<number>
    | Length<number>
    | Pattern<RegExp>
    | Alpha
    | AlphaNumeric
    | Numeric
    | Lower
    | Upper
    | Capital
    | UnCapital
    | DateTime
    | Date
    | Time
    | Email
    | Url
    | Phone
    | Ip
    | IpV4
    | IpV6
    | IpRange
    | UUID;

export type StringFormat<T extends StringFormatParam> = string & (T | unknown);

// TEST CASES
export type EmailFormat = StringFormat<Email & MaxLength<126>>;
export type ALPHN = StringFormat<{regexp: typeof ALPHANUMERIC_REGEX}>;
export const ml: ALPHN = 'qwer';
export const email: EmailFormat = 'qwer';
