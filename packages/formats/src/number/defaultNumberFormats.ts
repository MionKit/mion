/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {NumberFormat} from '../numberFormnat.runtype';

export type Number_Integer = NumberFormat<{integer: true}>;
export type Number_Float = NumberFormat<{float: true}>;
export type Number_Positive = NumberFormat<{min: 0}>;
export type Number_Negative = NumberFormat<{max: 0}>;
export type Number_PositiveInteger = NumberFormat<{min: 0; integer: true}>;
export type Number_NegativeInteger = NumberFormat<{max: 0; integer: true}>;
export type Number_Int32 = NumberFormat<{integer: true; min: -2147483648; max: 2147483647}>;
export type Number_Uint32 = NumberFormat<{integer: true; min: 0; max: 4294967295}>;
export type Number_Int64 = NumberFormat<{integer: true; min: -9223372036854775808; max: typeof Number.MAX_SAFE_INTEGER}>;
