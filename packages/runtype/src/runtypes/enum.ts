/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TEnum, Type as TypeBox} from '@sinclair/typebox';
import {TypeEnum} from '@deepkit/type';
import {TEnumKey} from '@sinclair/typebox/build/require/type/enum';

// mapArray function: Maps a Deepkit TypeArray to a TypeBox TArray<T>
export function resolveEnum(deepkitType: TypeEnum, opts: SchemaOptions): TEnum {
    // typescript supports null and undefined enum values but not TypeBox, it still works though
    const srcEnum: Record<TEnumKey, string | number> = deepkitType.enum as any;
    return TypeBox.Enum(srcEnum, opts);
}
