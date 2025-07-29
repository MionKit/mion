/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Main StringFormat Export ###############

// Re-export the main StringFormat type
export {FormatString} from './string/stringFormat.runtype';

// ############### Date/Time Formats ###############

export {FormatDate as Date} from './string/date.runtype';
export {FormatDateTime as DateTime} from './string/dateTime.runtype';
export {FormatTime as Time} from './string/time.runtype';

// ############### Network/Web Formats ###############

export {FormatEmail as Email} from './string/email.runtype';
export {FormatEmailStrict as EmailStrict} from './string/email.runtype';
export {FormatEmailPattern as EmailPattern} from './string/email.runtype';
export {FormatEmailPunycode as EmailPunycode} from './string/email.runtype';

export {FormatDomain as Domain} from './string/domain.runtype';
export {FormatDomainStrict as DomainStrict} from './string/domain.runtype';

export {FormatUrl as Url} from './string/url.runtype';
export {FormatUrlHttp as UrlHttp} from './string/url.runtype';
export {FormatUrlFile as UrlFile} from './string/url.runtype';
export {FormatUrlSocialMedia as UrlSocialMedia} from './string/url.runtype';

export {FormatIP as IP} from './string/ip.runtype';
export {FormatIPV4 as IPV4} from './string/ip.runtype';
export {FormatIPV6 as IPV6} from './string/ip.runtype';
export {FormatIPWithPort as IPWithPort} from './string/ip.runtype';
export {FormatIPV4WithPort as IPV4WithPort} from './string/ip.runtype';
export {FormatIPV6WithPort as IPV6WithPort} from './string/ip.runtype';

// ############### Identifier Formats ###############

export {FormatUUIDV4 as UUID} from './string/uuid.runtype'; // default to V4
export {FormatUUIDV4 as UUID_V4} from './string/uuid.runtype';
export {FormatUUIDV7 as UUID_V7} from './string/uuid.runtype';

// ############### Default String Formats ###############

export {FormatAlphaNumeric as AlphaNumeric} from './string/defaultStringFormats.runtype';
export {FormatAlpha as Alpha} from './string/defaultStringFormats.runtype';
export {FormatNumeric as Numeric} from './string/defaultStringFormats.runtype';
export {FormatLowercase as Lowercase} from './string/defaultStringFormats.runtype';
export {FormatUppercase as Uppercase} from './string/defaultStringFormats.runtype';
export {FormatCapitalize as Capitalize} from './string/defaultStringFormats.runtype';
