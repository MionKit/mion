/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// ts-runtypes migration: proxy over @ts-runtypes/core/formats (see StringFormats.ts).

import '@ts-runtypes/core/formats';
import type {
    Number as RtNumber,
    NumberParams,
    Currency,
    Integer,
    Float,
    Positive,
    Negative,
    PositiveInt,
    NegativeInt,
    Int8,
    Int16,
    Int32,
    UInt8,
    UInt16,
    UInt32,
} from '@ts-runtypes/core/formats';

export type {NumberParams, Currency} from '@ts-runtypes/core/formats';

/** Number format with optional branding. Unbranded by default. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatNumber<P extends NumberParams = {}, BrandName extends string = never> = RtNumber<P, BrandName>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatCurrency<P extends NumberParams = {}, BrandName extends string = never> = Currency<P, BrandName>;

// ############### Default number formats ###############

export type FormatInteger = Integer;
export type FormatFloat = Float;
export type FormatPositive = Positive;
export type FormatNegative = Negative;
export type FormatPositiveInt = PositiveInt;
export type FormatNegativeInt = NegativeInt;
export type FormatInt8 = Int8;
export type FormatInt16 = Int16;
export type FormatInt32 = Int32;
export type FormatUInt8 = UInt8;
export type FormatUInt16 = UInt16;
export type FormatUInt32 = UInt32;
