import {TypeFormatPrimitives} from './formats.types.ts';

// ⚠️ R20 — these Brands are STANDALONE nominal helpers, NOT a server↔client contract that
// ts-runtypes Format types satisfy automatically. Under @ts-runtypes/core a `FormatEmail` value is
// a plain `string` (its BrandName is `never`), so `FormatEmail` is NOT assignable to `BrandEmail`
// and brand-narrowing off a validated Format value does not "just work". They are kept because they
// ARE used as a nominal name registry: @mionjs/drizzle derives its BrandColumnMap key set from these
// names (AllBrandNames) and mion error-param types reference them. Brand explicitly (cast/helper)
// when you want nominal narrowing. Wiring Formats to carry a real BrandName is an upstream ts-runtypes
// follow-up — see docs/todos/formats-brandname-upstream.md.

/**
 * Base branded type - combines BaseType with a nominal brand marker.
 * This is a convenience type for creating branded primitives.
 */
export type Brand<BaseType extends TypeFormatPrimitives, Name extends string> = BaseType & {brand: Name};

// String brands - format names must match the formatter IDs in type-formats package
export type BrandEmail = Brand<string, 'email'>;
export type BrandUUID = Brand<string, 'uuid'>;
export type BrandUrl = Brand<string, 'url'>;
export type BrandDomain = Brand<string, 'domain'>;
export type BrandIP = Brand<string, 'ip'>;
export type BrandDate = Brand<string, 'date'>;
export type BrandTime = Brand<string, 'time'>;
export type BrandDateTime = Brand<string, 'dateTime'>;

// Number brands - for type narrowing in drizzle column mapping and error params
export type BrandInteger = Brand<number, 'integer'>;
export type BrandFloat = Brand<number, 'float'>;
export type BrandPositive = Brand<number, 'positive'>;
export type BrandNegative = Brand<number, 'negative'>;
export type BrandPositiveInt = Brand<number, 'positiveInt'>;
export type BrandNegativeInt = Brand<number, 'negativeInt'>;
export type BrandInt8 = Brand<number, 'int8'>;
export type BrandInt16 = Brand<number, 'int16'>;
export type BrandInt32 = Brand<number, 'int32'>;
export type BrandUInt8 = Brand<number, 'uint8'>;
export type BrandUInt16 = Brand<number, 'uint16'>;
export type BrandUInt32 = Brand<number, 'uint32'>;
