/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TArray, Type as TypeBox} from '@sinclair/typebox';
import {TypeArray} from '../_deepkit/src/reflection/type';
import {DeepkitVisitor} from './typeBoxTypes';

// mapArray function: Maps a Deepkit TypeArray to a TypeBox TArray<T>
export function resolveArray(deepkitType: TypeArray, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TArray {
    const arrayType = resolveTypeBox(deepkitType.type, {});
    return TypeBox.Array(arrayType, opts);
}
