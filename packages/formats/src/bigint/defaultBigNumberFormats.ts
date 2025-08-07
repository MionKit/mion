/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BigNumFormat} from './bigIntFormat.runtype';

export type BigNumPositive = BigNumFormat<{min: 0n}>;
export type BigNumNegative = BigNumFormat<{max: 0n}>;
export type BigNumPositiveInt = BigNumFormat<{min: 0n; multipleOf: 1n}>;
export type BigNumNegativeInt = BigNumFormat<{max: 0n; multipleOf: 1n}>;
export type BigNumInt64 = BigNumFormat<{min: -9223372036854775808n; max: 9223372036854775807n}>;
