/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Import modules to execute side effects (registerFormatter calls) ###############

// Import main number format module to register the formatter
import './number/numberFormat.runtype';

// Import default number format modules to register formatters
import './number/defaultNumberFormats';

// ############### Main NumberFormat Export ###############

// TEMPORARY WORKAROUND: Using export * instead of named exports due to metadata compilation issue
// See: https://github.com/deepkit/deepkit-framework/issues/634
// TODO: Revert to named exports once the issue is fixed

// Re-export everything from number format modules
export * from './number/numberFormat.runtype';
export * from './number/defaultNumberFormats';

// COMMENTED OUT - Original named exports (to be restored after issue is fixed):
// // Re-export the main NumberFormat type
// export {NumFormat} from './number/numberFormat.runtype';
//
// // ############### Default Number Formats ###############
//
// export {NumInteger} from './number/defaultNumberFormats';
// export {NumFloat} from './number/defaultNumberFormats';
// export {NumPositive} from './number/defaultNumberFormats';
// export {NumNegative} from './number/defaultNumberFormats';
// export {NumPositiveInt} from './number/defaultNumberFormats';
// export {NumNegativeInt} from './number/defaultNumberFormats';
// export {NumInt32} from './number/defaultNumberFormats';
// export {NumUInt32 as NumUint32} from './number/defaultNumberFormats';
