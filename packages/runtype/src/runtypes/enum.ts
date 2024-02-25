/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TEnum, Type as TypeBox} from '@sinclair/typebox';
import {TypeEnum} from '@deepkit/type';

// mapArray function: Maps a Deepkit TypeArray to a TypeBox TArray<T>
export function resolveEnum(deepkitType: TypeEnum, opts: SchemaOptions): TEnum {
    // typescript supports null and undefined enum values but not TypeBox, it still works though
    const srcEnum = deepkitType.enum as {[key: string]: string | number};
    return TypeBox.Enum(srcEnum, opts);
}
