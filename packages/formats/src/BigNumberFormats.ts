/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Import modules to execute side effects (registerFormatter calls) ###############

// Import main bigint format module to register the formatter
import './bigint/bigIntFormat.runtype';

// Import default bigint format modules to register formatters
import './bigint/defaultBigNumberFormats';

// ############### Main BigIntFormat Export ###############

// Re-export the main BigIntFormat type
export {BigNumFormat as FormatBigInt} from './bigint/bigIntFormat.runtype';

// ############### Default BigInt Formats ###############

export {BigNumPositive} from './bigint/defaultBigNumberFormats';
export {BigNumNegative} from './bigint/defaultBigNumberFormats';
export {BigNumPositiveInt} from './bigint/defaultBigNumberFormats';
export {BigNumNegativeInt} from './bigint/defaultBigNumberFormats';
export {BigNumInt64} from './bigint/defaultBigNumberFormats';
