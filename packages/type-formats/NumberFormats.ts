/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Import modules to execute side effects (registerFormatter calls) ###############

// Import main number format module to register the formatter
import './src/number/numberFormat.runtype.ts';

// Import default number format modules to register formatters
import './src/number/defaultNumberFormats.ts';

// ############### Main NumberFormat Export ###############

// TEMPORARY WORKAROUND: Using export * instead of named exports due to metadata compilation issue
// See: https://github.com/deepkit/deepkit-framework/issues/634
// TODO: Revert to named exports once the issue is fixed

// Re-export everything from number format modules
export * from './src/number/numberFormat.runtype.ts';
export * from './src/number/defaultNumberFormats.ts';

// COMMENTED OUT - Original named exports (to be restored after issue is fixed):
// // Re-export the main NumberFormat type
// export {FormatNumber} from './number/numberFormat.runtype';
//
// // ############### Default Number Formats ###############
//
// export {FormatInteger} from './number/defaultNumberFormats';
// export {FormatFloat} from './number/defaultNumberFormats';
// export {FormatPositive} from './number/defaultNumberFormats';
// export {FormatNegative} from './number/defaultNumberFormats';
// export {FormatPositiveInt} from './number/defaultNumberFormats';
// export {FormatNegativeInt} from './number/defaultNumberFormats';
// export {FormatInt32} from './number/defaultNumberFormats';
// export {FormatUInt32 as NumUint32} from './number/defaultNumberFormats';
