/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Main StringFormat Export ###############

// Re-export the main StringFormat type
export {StringFormat} from './string/stringFormat.runtype';

// ############### Date/Time Formats ###############

export {DateFormat as Date} from './string/date.runtype';
export {DateTimeFormat as DateTime} from './string/dateTime.runtype';
export {TimeFormat as Time} from './string/time.runtype';

// ############### Network/Web Formats ###############

export {EmailFormat as Email} from './string/email.runtype';
export {EmailFormat_Strict as EmailStrict} from './string/email.runtype';
export {EmailFormat_Pattern as EmailPattern} from './string/email.runtype';
export {EmailFormat_Punycode as EmailPunycode} from './string/email.runtype';

export {DomainFormat as Domain} from './string/domain.runtype';
export {DomainFormat_Strict as DomainStrict} from './string/domain.runtype';

export {UrlFormat as Url} from './string/url.runtype';
export {UrlFormat_Http as UrlHttp} from './string/url.runtype';
export {UrlFormat_File as UrlFile} from './string/url.runtype';
export {UrlFormat_SocialMedia as UrlSocialMedia} from './string/url.runtype';

export {IP_Format as IP} from './string/ip.runtype';
export {IPV4_Format as IPV4} from './string/ip.runtype';
export {IPV6_Format as IPV6} from './string/ip.runtype';
export {IPWithPort_Format as IPWithPort} from './string/ip.runtype';
export {IPV4WithPort_Format as IPV4WithPort} from './string/ip.runtype';
export {IPV6WithPort_Format as IPV6WithPort} from './string/ip.runtype';

// ############### Identifier Formats ###############

export {UUIDFormat_V4 as UUID} from './string/uuid.runtype'; // default to V4
export {UUIDFormat_V4 as UUID_V4} from './string/uuid.runtype';
export {UUIDFormat_V7 as UUID_V7} from './string/uuid.runtype';

// ############### Default String Formats ###############

export {String_Alphanumeric as AlphaNumeric} from './string/defaultStringFormats.runtype';
export {String_Alpha as Alpha} from './string/defaultStringFormats.runtype';
export {String_Numeric as Numeric} from './string/defaultStringFormats.runtype';
export {String_Lowercase as Lowercase} from './string/defaultStringFormats.runtype';
export {String_Uppercase as Uppercase} from './string/defaultStringFormats.runtype';
export {String_Capitalize as Capitalize} from './string/defaultStringFormats.runtype';
