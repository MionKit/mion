import {TypeFormatPrimitives} from './formats.types';

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
