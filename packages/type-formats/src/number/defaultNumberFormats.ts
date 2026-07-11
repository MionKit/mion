/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FormatNumber} from './numberFormat.runtype.ts';

/** Integer number format, always branded with 'integer'. */
export type FormatInteger = FormatNumber<{integer: true}, 'integer'>;
/** Float number format, always branded with 'float'. */
export type FormatFloat = FormatNumber<{float: true}, 'float'>;
/** Positive number format (>= 0), always branded with 'positive'. */
export type FormatPositive = FormatNumber<{min: 0}, 'positive'>;
/** Negative number format (<= 0), always branded with 'negative'. */
export type FormatNegative = FormatNumber<{max: 0}, 'negative'>;
/** Positive integer format (>= 0, integer), always branded with 'positiveInt'. */
export type FormatPositiveInt = FormatNumber<{min: 0; integer: true}, 'positiveInt'>;
/** Negative integer format (<= 0, integer), always branded with 'negativeInt'. */
export type FormatNegativeInt = FormatNumber<{max: 0; integer: true}, 'negativeInt'>;
/** 8-bit signed integer (-128 to 127), always branded with 'int8'. */
export type FormatInt8 = FormatNumber<{integer: true; min: -128; max: 127}, 'int8'>;
/** 16-bit signed integer (-32768 to 32767), always branded with 'int16'. */
export type FormatInt16 = FormatNumber<{integer: true; min: -32768; max: 32767}, 'int16'>;
/** 32-bit signed integer, always branded with 'int32'. */
export type FormatInt32 = FormatNumber<{integer: true; min: -2147483648; max: 2147483647}, 'int32'>;
/** 8-bit unsigned integer (0 to 255), always branded with 'uint8'. */
export type FormatUInt8 = FormatNumber<{integer: true; min: 0; max: 255}, 'uint8'>;
/** 16-bit unsigned integer (0 to 65535), always branded with 'uint16'. */
export type FormatUInt16 = FormatNumber<{integer: true; min: 0; max: 65535}, 'uint16'>;
/** 32-bit unsigned integer (0 to 4294967295), always branded with 'uint32'. */
export type FormatUInt32 = FormatNumber<{integer: true; min: 0; max: 4294967295}, 'uint32'>;
