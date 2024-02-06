/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeLiteral} from '@deepkit/type';
import {SchemaOptions, TBigInt, TLiteral, TRegExp, TSymbol, Type as TypeBox} from '@sinclair/typebox';

export function resolveLiteral(deepkitType: TypeLiteral, opts: SchemaOptions): TLiteral | TRegExp | TBigInt | TSymbol {
    if (typeof deepkitType.literal === 'bigint')
        throw new Error('Typebox does not allow bigint literals i.e: type T = 1n; is not allowed by Typebox');
    if (typeof deepkitType.literal === 'symbol')
        throw new Error('Typebox does not allow bigint literals i.e: type T = Symbol("foo"); is not allowed by Typebox');
    if (deepkitType.literal instanceof RegExp) return TypeBox.RegExp(deepkitType.literal, opts);
    return TypeBox.Literal(deepkitType.literal, opts);
}
