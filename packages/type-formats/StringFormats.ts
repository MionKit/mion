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

// Import pure functions module to register all pure functions
import './src/type-formats-pure-fns.ts';

// Import date/time format modules to register formatters
import './src/string/date.runtype.ts';
import './src/string/dateTime.runtype.ts';
import './src/string/time.runtype.ts';

// Import network/web format modules to register formatters
import './src/string/email.runtype.ts';
import './src/string/domain.runtype.ts';
import './src/string/url.runtype.ts';
import './src/string/ip.runtype.ts';

// Import identifier format modules to register formatters
import './src/string/uuid.runtype.ts';

// Import default string format modules to register formatters
import './src/string/defaultStringFormats.runtype.ts';

// Re-export everything from string format modules
export * from './src/string/stringFormat.runtype.ts';
export * from './src/string/date.runtype.ts';
export * from './src/string/dateTime.runtype.ts';
export * from './src/string/time.runtype.ts';
export * from './src/string/email.runtype.ts';
export * from './src/string/domain.runtype.ts';
export * from './src/string/url.runtype.ts';
export * from './src/string/ip.runtype.ts';
export * from './src/string/uuid.runtype.ts';
export * from './src/string/defaultStringFormats.runtype.ts';

// Re-export pure functions for easy access
export * from './src/type-formats-pure-fns.ts';

// COMMENTED OUT - Original named exports (to be restored after issue is fixed):
// // ############### Main StringFormat Export ###############
// export {FormatString};
//
// // ############### Date/Time Formats ###############
//
// export {FormatStringDate} from './string/date.runtype';
// export {FormatStringDateTime} from './string/dateTime.runtype';
// export {FormatStringTime} from './string/time.runtype';
//
// // ############### Network/Web Formats ###############
//
// export {FormatEmail} from './string/email.runtype';
// export {FormatEmailStrict} from './string/email.runtype';
// export {FormatEmailPattern} from './string/email.runtype';
// export {FormatEmailPunycode} from './string/email.runtype';
//
// export {FormatDomain} from './string/domain.runtype';
// export {FormatDomainStrict} from './string/domain.runtype';
//
// export {FormatUrl} from './string/url.runtype';
// export {FormatUrlHttp} from './string/url.runtype';
// export {FormatUrlFile} from './string/url.runtype';
// export {FormatUrlSocialMedia} from './string/url.runtype';
//
// export {FormatIP} from './string/ip.runtype';
// export {FormatIPv4} from './string/ip.runtype';
// export {FormatIPv6} from './string/ip.runtype';
// export {FormatIPWithPort} from './string/ip.runtype';
// export {FormatIPv4WithPort} from './string/ip.runtype';
// export {FormatIPv6WithPort} from './string/ip.runtype';
//
// // ############### Identifier Formats ###############
//
// export {FormatUUIDv4} from './string/uuid.runtype';
// export {FormatUUIDv7} from './string/uuid.runtype';
//
// // ############### Default String Formats ###############
//
// export {FormatAlphaNumeric} from './string/defaultStringFormats.runtype';
// export {FormatAlpha} from './string/defaultStringFormats.runtype';
// export {FormatNumeric} from './string/defaultStringFormats.runtype';
// export {FormatLowercase} from './string/defaultStringFormats.runtype';
// export {FormatUppercase} from './string/defaultStringFormats.runtype';
// export {FormatCapitalize} from './string/defaultStringFormats.runtype';
