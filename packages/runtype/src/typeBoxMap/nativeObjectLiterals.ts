/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TAsyncIterator, TIterator, Type as TypeBox} from '@sinclair/typebox';
import {TypeObjectLiteral} from '../_deepkit/src/reflection/type';
import {DeepkitVisitor} from './typeBoxTypes';

export function resolveIterator(deepkitType: TypeObjectLiteral, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TIterator {
    const origin = deepkitType.originTypes?.[0];
    if (!origin || origin.typeName !== 'Iterator') throw new Error(`Type is not an Iterator ie. Iterator<string>`);
    const argType = origin?.typeArguments?.[0];
    if (!argType) throw new Error(`Iterator missing type argument ie. Iterator<[type]>`);
    const itemTypeBox = resolveTypeBox(argType, {});
    return TypeBox.Iterator(itemTypeBox, opts);
}

export function resolveAsyncIterator(
    deepkitType: TypeObjectLiteral,
    opts: SchemaOptions,
    resolveTypeBox: DeepkitVisitor
): TAsyncIterator {
    const origin = deepkitType.originTypes?.[0];
    console.log('resolveAsyncIterator origin', origin);
    if (!origin || origin.typeName !== 'AsyncIterator')
        throw new Error(`Type is not an Async Iterator ie. AsyncIterator<string>`);
    const argType = origin?.typeArguments?.[0];
    if (!argType) throw new Error(`Async Iterator missing type argument ie. AsyncIterator<[type]>`);
    const itemTypeBox = resolveTypeBox(argType, {});
    return TypeBox.AsyncIterator(itemTypeBox, opts);
}
