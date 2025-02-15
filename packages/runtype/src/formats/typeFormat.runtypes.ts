/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Branded Types #####################

import {TypeLiteral} from '../lib/_deepkit/src/reflection/type';

export type ValidatorParams = {
    /**
     * Validator name, or {name + params}.
     * Must match the name of an existing JitRunTypeValidator
     */
    validator?: string | {validator: string; [key: string]: TypeLiteral['literal']};
};

export type FormatterParams = {
    /**
     * Formatter name, or {name + params}.
     * Must match the name of an existing JitRunTypeFormatter
     */
    formatter?: string | {formatter: string; [key: string]: TypeLiteral['literal']};
};

/**
 * Type Validator and Formatter parameters
 */
export type TypeParams = ValidatorParams & FormatterParams;

/**
 * A base type that satisfies some extra constrains. (at the moment only Branded types of strings and numbers are supported)
 * ie: an Alphanumeric type is an string that only allow letters and numbers.
 * ie: in Integer type is a number that only allow integer values.
 *
 * Branded type must match ./lib/_deepkit/src/reflection/type<TypeAnnotation>
 * */

export type TypeFormat<BaseType extends string | number, Name extends string, P extends TypeParams> = BaseType & {
    __meta?: never & [Name, P];
};
