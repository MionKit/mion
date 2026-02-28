/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FormatBigInt} from './bigIntFormat.runtype.ts';

export type FormatBigPositive = FormatBigInt<{min: 0n}>;
export type FormatBigNegative = FormatBigInt<{max: 0n}>;
export type FormatBigPositiveInt = FormatBigInt<{min: 0n; multipleOf: 1n}>;
export type FormatBigNegativeInt = FormatBigInt<{max: 0n; multipleOf: 1n}>;
export type FormatBigInt64 = FormatBigInt<{min: -9223372036854775808n; max: 9223372036854775807n}>;
export type FormatBigUInt64 = FormatBigInt<{min: 0n; max: 18446744073709551615n}>;
