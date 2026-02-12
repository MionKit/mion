/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Import modules to execute side effects (registerFormatter calls) ###############

// Import main bigint format module to register the formatter
import './src/bigint/bigIntFormat.runtype.ts';

// Import default bigint format modules to register formatters
import './src/bigint/defaultBigNumberFormats.ts';

// ############### Main BigIntFormat Export ###############

// TEMPORARY WORKAROUND: Using export * instead of named exports due to metadata compilation issue
// See: https://github.com/deepkit/deepkit-framework/issues/634
// TODO: Revert to named exports once the issue is fixed

// Re-export everything from bigint format modules
export * from './src/bigint/bigIntFormat.runtype.ts';
export * from './src/bigint/defaultBigNumberFormats.ts';

// COMMENTED OUT - Original named exports (to be restored after issue is fixed):
// // Re-export the main BigIntFormat type
// export {BigNumFormat as FormatBigInt} from './bigint/bigIntFormat.runtype';
//
// // ############### Default BigInt Formats ###############
//
// export {BigNumPositive} from './bigint/defaultBigNumberFormats';
// export {BigNumNegative} from './bigint/defaultBigNumberFormats';
// export {BigNumPositiveInt} from './bigint/defaultBigNumberFormats';
// export {BigNumNegativeInt} from './bigint/defaultBigNumberFormats';
// export {BigNumInt64} from './bigint/defaultBigNumberFormats';
