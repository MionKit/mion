/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Types FORMATS #####################

import type {TypeFormatParams} from '../types';

/**
 * A base type that satisfies some extra constrains. (at the moment only Branded types of strings and numbers are supported)
 * ie: an Alphanumeric type is an string that only allow letters and numbers.
 * ie: in Integer type is a number that only allow integer values.
 *
 * TypeFormat is the equivalent ot TypeAnnotation in DK but with slight modifications ./lib/_deepkit/src/reflection/type<TypeAnnotation>
 * */
export type TypeFormat<BaseType extends string | number, Name extends string, P extends TypeFormatParams> = BaseType & {
    __meta?: never & [Name, P];
};
