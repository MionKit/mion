/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {NumFormat} from './numberFormnat.runtype';

export type NumInteger = NumFormat<{integer: true}>;
export type NumFloat = NumFormat<{float: true}>;
export type NumPositive = NumFormat<{min: 0}>;
export type NumNegative = NumFormat<{max: 0}>;
export type NumPositiveInt = NumFormat<{min: 0; integer: true}>;
export type NumNegativeInt = NumFormat<{max: 0; integer: true}>;
export type NumInt32 = NumFormat<{integer: true; min: -2147483648; max: 2147483647}>;
export type NumUInt32 = NumFormat<{integer: true; min: 0; max: 4294967295}>;
