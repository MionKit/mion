/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FormatNumber} from './numberFormnat.runtype';

export type FormatInteger = FormatNumber<{integer: true}>;
export type FormatFloat = FormatNumber<{float: true}>;
export type FormatPositive = FormatNumber<{min: 0}>;
export type FormatNegative = FormatNumber<{max: 0}>;
export type FormatPositiveInteger = FormatNumber<{min: 0; integer: true}>;
export type FormatNegativeInteger = FormatNumber<{max: 0; integer: true}>;
export type FormatInt32 = FormatNumber<{integer: true; min: -2147483648; max: 2147483647}>;
export type FormatUint32 = FormatNumber<{integer: true; min: 0; max: 4294967295}>;
export type FormatInt64 = FormatNumber<{integer: true; min: -9223372036854775808; max: typeof Number.MAX_SAFE_INTEGER}>;
