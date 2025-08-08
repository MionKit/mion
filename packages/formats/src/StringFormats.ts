/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Import modules to execute side effects (registerFormatter calls) ###############

// TEMPORARY WORKAROUND: Using export * instead of named exports due to metadata compilation issue
// See: https://github.com/deepkit/deepkit-framework/issues/634
// TODO: Revert to named exports once the issue is fixed

// Import date/time format modules to register formatters
import './string/date.runtype';
import './string/dateTime.runtype';
import './string/time.runtype';

// Import network/web format modules to register formatters
import './string/email.runtype';
import './string/domain.runtype';
import './string/url.runtype';
import './string/ip.runtype';

// Import identifier format modules to register formatters
import './string/uuid.runtype';

// Import default string format modules to register formatters
import './string/defaultStringFormats.runtype';

// Re-export everything from string format modules
export * from './string/stringFormat.runtype';
export * from './string/date.runtype';
export * from './string/dateTime.runtype';
export * from './string/time.runtype';
export * from './string/email.runtype';
export * from './string/domain.runtype';
export * from './string/url.runtype';
export * from './string/ip.runtype';
export * from './string/uuid.runtype';
export * from './string/defaultStringFormats.runtype';

// COMMENTED OUT - Original named exports (to be restored after issue is fixed):
// // ############### Main StringFormat Export ###############
// export {StrFormat};
//
// // ############### Date/Time Formats ###############
//
// export {StrDate} from './string/date.runtype';
// export {StrDateTime} from './string/dateTime.runtype';
// export {StrTime} from './string/time.runtype';
//
// // ############### Network/Web Formats ###############
//
// export {StrEmail} from './string/email.runtype';
// export {StrEmailStrict} from './string/email.runtype';
// export {StrEmailPattern} from './string/email.runtype';
// export {StrEmailPunycode} from './string/email.runtype';
//
// export {StrDomain} from './string/domain.runtype';
// export {StrDomainStrict} from './string/domain.runtype';
//
// export {StrUrl} from './string/url.runtype';
// export {StrUrlHttp} from './string/url.runtype';
// export {StrUrlFile} from './string/url.runtype';
// export {StrUrlSocialMedia} from './string/url.runtype';
//
// export {StrIP} from './string/ip.runtype';
// export {StrIPv4} from './string/ip.runtype';
// export {StrIPv6} from './string/ip.runtype';
// export {StrIPWithPort} from './string/ip.runtype';
// export {StrIPv4WithPort} from './string/ip.runtype';
// export {StrIPv6WithPort} from './string/ip.runtype';
//
// // ############### Identifier Formats ###############
//
// export {StrUUIDv4} from './string/uuid.runtype';
// export {StrUUIDv7} from './string/uuid.runtype';
//
// // ############### Default String Formats ###############
//
// export {StrAlphaNumeric} from './string/defaultStringFormats.runtype';
// export {StrAlpha} from './string/defaultStringFormats.runtype';
// export {StrNumeric} from './string/defaultStringFormats.runtype';
// export {StrLowercase} from './string/defaultStringFormats.runtype';
// export {StrUppercase} from './string/defaultStringFormats.runtype';
// export {StrCapitalize} from './string/defaultStringFormats.runtype';
