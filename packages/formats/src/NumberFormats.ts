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

// Re-export the main NumberFormat type
export {NumFormat} from './number/numberFormat.runtype';

// ############### Default Number Formats ###############

export {NumInteger} from './number/defaultNumberFormats';
export {NumFloat} from './number/defaultNumberFormats';
export {NumPositive} from './number/defaultNumberFormats';
export {NumNegative} from './number/defaultNumberFormats';
export {NumPositiveInt} from './number/defaultNumberFormats';
export {NumNegativeInt} from './number/defaultNumberFormats';
export {NumInt32} from './number/defaultNumberFormats';
export {NumUInt32 as NumUint32} from './number/defaultNumberFormats';
