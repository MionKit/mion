/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema, Type as TypeBox} from '@sinclair/typebox';
import {TypePropertySignature} from '@deepkit/type';
import {DeepkitVisitor} from '../types';

export function resolvePropertySignature(
    deepkitType: TypePropertySignature,
    opts: SchemaOptions,
    resolveTypeBox: DeepkitVisitor
): TSchema {
    const prop = resolveTypeBox(deepkitType.type, opts);
    if (deepkitType.optional && deepkitType.readonly) return TypeBox.ReadonlyOptional(prop);
    else if (deepkitType.optional) return TypeBox.Optional(prop);
    else if (deepkitType.readonly) return TypeBox.Readonly(prop);
    else return prop;
}
