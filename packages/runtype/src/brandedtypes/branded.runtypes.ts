/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Branded Types #####################

export type ValidatorParams = {validator?: string};
export type SerializerParams = {transformer?: string};
export type TypeParams = ValidatorParams & SerializerParams; /**
 * A base type that satisfies some extra constrains. (at the moment only Branded types of strings and numbers are supported)
 * ie: an Alphanumeric type is an string that only allow letters and numbers.
 * ie: in Integer type is a number that only allow integer values.
 *
 * Branded type must match ./lib/_deepkit/src/reflection/type<TypeAnnotation>
 * */

export type BrandedType<BaseType extends string | number, Name extends string, P extends TypeParams> = BaseType & {
    __meta?: never & [Name, P];
};
