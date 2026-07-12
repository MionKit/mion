/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ts-runtypes migration: proxy over @ts-runtypes/core/formats (see StringFormats.ts).

import '@ts-runtypes/core/formats';
import type {
    BigInt as RtBigInt,
    BigIntParams,
    BigPositive,
    BigNegative,
    BigPositiveInt,
    BigNegativeInt,
    BigInt64,
    BigUInt64,
} from '@ts-runtypes/core/formats';

export type {BigIntParams} from '@ts-runtypes/core/formats';

/** BigInt format with optional branding. Unbranded by default. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatBigInt<P extends BigIntParams = {}, BrandName extends string = never> = RtBigInt<P, BrandName>;

// ############### Default bigint formats ###############

export type FormatBigPositive = BigPositive;
export type FormatBigNegative = BigNegative;
export type FormatBigPositiveInt = BigPositiveInt;
export type FormatBigNegativeInt = BigNegativeInt;
export type FormatBigInt64 = BigInt64;
export type FormatBigUInt64 = BigUInt64;
