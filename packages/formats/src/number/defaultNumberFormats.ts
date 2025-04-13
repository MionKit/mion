/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {NumberFormat} from '../numberFormnat.runtype';

export type NumberFormat_Integer = NumberFormat<{integer: true}>;
export type NumberFormat_Float = NumberFormat<{float: true}>;
export type NumberFormat_Positive = NumberFormat<{min: 0}>;
export type NumberFormat_Negative = NumberFormat<{max: 0}>;
export type NumberFormat_PositiveInteger = NumberFormat<{min: 0; integer: true}>;
export type NumberFormat_NegativeInteger = NumberFormat<{max: 0; integer: true}>;
export type NUmberFormat_Int32 = NumberFormat<{integer: true; min: -2147483648; max: 2147483647}>;
export type NUmberFormat_Uint32 = NumberFormat<{integer: true; min: 0; max: 4294967295}>;
export type NUmberFormat_Int64 = NumberFormat<{integer: true; min: -9223372036854775808; max: typeof Number.MAX_SAFE_INTEGER}>;
