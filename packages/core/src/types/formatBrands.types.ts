/** Base branded type - combines BaseType with format name */
export type Brand<BaseType extends string | number | bigint, Name extends string> = BaseType & {format: Name};

// String brands - format names must match the formatter IDs in type-formats package
export type BrandString = Brand<string, 'stringFormat'>;
export type BrandEmail = Brand<string, 'email'>;
export type BrandUUID = Brand<string, 'uuid'>;
export type BrandUrl = Brand<string, 'url'>;
export type BrandDomain = Brand<string, 'domain'>;
export type BrandIP = Brand<string, 'ip'>;
export type BrandDate = Brand<string, 'date'>;
export type BrandTime = Brand<string, 'time'>;
export type BrandDateTime = Brand<string, 'dateTime'>;

// Number brands
export type NumBrand = Brand<number, 'numberFormat'>;

// BigInt brands
export type BigIntBrand = Brand<bigint, 'bigintFormat'>;
