/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema, TUnion, Type as TypeBox} from '@sinclair/typebox';
import {TypeUnion} from '../_deepkit/src/reflection/type';
import {DeepkitVisitor} from './typeBoxTypes';

// mapArray function: Maps a Deepkit TypeArray to a TypeBox TArray<T>
export function resolveUnion(deepkitType: TypeUnion, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TUnion {
    // typescript supports null and undefined enum values but not TypeBox, it still works though
    const items: TSchema[] = deepkitType.types.map((member) => resolveTypeBox(member, {}));
    return TypeBox.Union(items, opts);
}
