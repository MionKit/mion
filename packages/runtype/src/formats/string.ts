/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DATE_REGEX, DATE_TIME_REGEX, TIME_REGEX} from './regexp';

// number & length
export type Max<N extends number> = {__max: N};
export type Min<N extends number> = {__min: N};
export type Length<N extends number> = {__length: N};
export type Range<Mi extends number, Ma extends number> = {__range: [Mi, Ma]};
export type GT<N extends number> = {__gt: N};
export type GTE<N extends number> = {__gte: N};
export type LT<N extends number> = {__lt: N};
export type LTE<N extends number> = {__lte: N};

// String
export type Pattern<R extends RegExp> = {__pattern: R};
export type Alpha = {__alpha: true};
export type AlphaNumeric = {__alphaNumeric: true};
export type Numeric = {__numeric: true};
export type Lower = {__lower: true};
export type Upper = {__upper: true};
export type Capitalize = {__Capitalize: true};
export type UnCapitalize = {__UnCapitalize: true};

// Date and Time

export type DateTime = {__dateTime: typeof DATE_TIME_REGEX};
export type Date = {__date: typeof DATE_REGEX};
export type Time = {__time: typeof TIME_REGEX};

// Internet
export type Email = {__max: 254; __email: true};
export type Domain = {__domain: true};
export type Url = {__max: 2048; __url: true};
export type Phone = {__phone: true};
export type Ip = {__ip: true};
export type IpV4 = {__ipV4: true};
export type IpV6 = {__ipV6: true};
export type IpRange = {__ipRange: true};

// IDs
export type UUID = {__uuid: true};

export type StringFormatParam =
    | Max<number>
    | Min<number>
    | Length<number>
    | Range<number, number>
    | Pattern<RegExp>
    | Alpha
    | AlphaNumeric
    | Numeric
    | Lower
    | Upper
    | Capitalize
    | UnCapitalize
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

export type StringFormat<T extends StringFormatParam[]> = T;

export type EmailFormat = StringFormat<[Email, Max<250>]>;
