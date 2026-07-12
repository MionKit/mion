/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ts-runtypes migration: @mionjs/type-formats is now a thin proxy over
// @ts-runtypes/core/formats (the published successor of this package's old
// deepkit-era format compilers). The side-effect import registers every format
// pattern, pure fn and mocking fn; the aliases keep mion's historical names.

import '@ts-runtypes/core/formats';
import type {
    String as RtString,
    StringParams,
    Alpha,
    AlphaNumeric,
    Numeric,
    Lowercase as RtLowercase,
    Uppercase as RtUppercase,
    Capitalize as RtCapitalize,
    UUIDv4,
    UUIDv7,
    IP,
    IPv4,
    IPv6,
    IPWithPort,
    IPv4WithPort,
    IPv6WithPort,
    Domain,
    DomainUnicode,
    DomainPunycode,
    DomainStrict,
    Email,
    EmailPunycode,
    EmailStrict,
    Url,
    UrlHttp,
    UrlFile,
    StringDate,
    StringTime,
    StringDateTime,
    DateParams,
    TimeParams,
    DateTimeParams,
    DEFAULT_DATE_PARAMS,
    DEFAULT_TIME_FORMAT_PARAMS,
    DEFAULT_DATE_TIME_PARAMS,
} from '@ts-runtypes/core/formats';

// re-export the underlying param/pattern types so consumers can type params
export type {
    StringParams,
    PatternParam,
    Samples,
    AllowedCharsParam,
    DisallowedCharsParam,
    AllowedValuesParam,
    DisallowedValuesParam,
    DateParams,
    TimeParams,
    DateTimeParams,
    DateFmt,
    TimeFmt,
} from '@ts-runtypes/core/formats';

// ############### Main StringFormat ###############

/** String format with optional branding. Unbranded by default. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatString<P extends StringParams = {}, BrandName extends string = never> = RtString<P, BrandName>;

// ############### Default string formats ###############

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatAlpha<P extends StringParams = {}> = Alpha<P>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatAlphaNumeric<P extends StringParams = {}> = AlphaNumeric<P>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatNumeric<P extends StringParams = {}> = Numeric<P>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatLowercase<P extends StringParams = {}> = RtLowercase<P>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatUppercase<P extends StringParams = {}> = RtUppercase<P>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatCapitalize<P extends StringParams = {}> = RtCapitalize<P>;

// ############### Date/Time formats ###############

export type FormatStringDate<P extends Partial<DateParams> = DEFAULT_DATE_PARAMS> = StringDate<P>;
export type FormatStringTime<P extends Partial<TimeParams> = DEFAULT_TIME_FORMAT_PARAMS> = StringTime<P>;
export type FormatStringDateTime<P extends Partial<DateTimeParams> = DEFAULT_DATE_TIME_PARAMS> = StringDateTime<P>;

// ############### Network/Web formats ###############

export type FormatEmail = Email;
export type FormatEmailStrict = EmailStrict;
export type FormatEmailPunycode = EmailPunycode;

export type FormatDomain = Domain;
export type FormatDomainUnicode = DomainUnicode;
export type FormatDomainPunycode = DomainPunycode;
export type FormatDomainStrict = DomainStrict;

export type FormatUrl = Url;
export type FormatUrlHttp = UrlHttp;
export type FormatUrlFile = UrlFile;

export type FormatIP = IP;
export type FormatIPv4 = IPv4;
export type FormatIPv6 = IPv6;
export type FormatIPWithPort = IPWithPort;
export type FormatIPv4WithPort = IPv4WithPort;
export type FormatIPv6WithPort = IPv6WithPort;

// ############### Identifier formats ###############

export type FormatUUIDv4 = UUIDv4;
export type FormatUUIDv7 = UUIDv7;
