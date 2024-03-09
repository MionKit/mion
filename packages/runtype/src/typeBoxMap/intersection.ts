/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TIntersect, TSchema, Type as TypeBox} from '@sinclair/typebox';
import {TypeIntersection} from '@deepkit/type';
import {DeepkitVisitor} from './typeBoxTypes';

// mapArray function: Maps a Deepkit TypeArray to a TypeBox TArray<T>
export function resolveIntersection(
    deepkitType: TypeIntersection,
    opts: SchemaOptions,
    resolveTypeBox: DeepkitVisitor
): TIntersect {
    console.log(deepkitType);
    // typescript supports null and undefined enum values but not TypeBox, it still works though
    const items: TSchema[] = deepkitType.types.map((member) => resolveTypeBox(member, {}));
    return TypeBox.Intersect(items, opts);
}
