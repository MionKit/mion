/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ############### Main NumberFormat Export ###############

// Re-export the main NumberFormat type
export {FormatNumber} from './number/numberFormnat.runtype';

// ############### Default Number Formats ###############

export {FormatInteger as Integer} from './number/defaultNumberFormats';
export {FormatFloat as Float} from './number/defaultNumberFormats';
export {FormatPositive as Positive} from './number/defaultNumberFormats';
export {FormatNegative as Negative} from './number/defaultNumberFormats';
export {FormatPositiveInteger as PositiveInteger} from './number/defaultNumberFormats';
export {FormatNegativeInteger as NegativeInteger} from './number/defaultNumberFormats';
export {FormatInt32 as Int32} from './number/defaultNumberFormats';
export {FormatUint32 as Uint32} from './number/defaultNumberFormats';
export {FormatInt64 as Int64} from './number/defaultNumberFormats';
