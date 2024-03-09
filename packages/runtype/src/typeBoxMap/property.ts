/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema, Type as TypeBox} from '@sinclair/typebox';
import {TypeProperty} from '@deepkit/type';
import {DeepkitVisitor} from './typeBoxTypes';

// returns property options rather than values
export function resolveProperty(deepkitType: TypeProperty, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TSchema {
    const propOpts = deepkitType.default ? {...opts, default: deepkitType.default()} : opts;
    const property = resolveTypeBox(deepkitType.type, propOpts);
    if (deepkitType.optional && deepkitType.readonly) return TypeBox.ReadonlyOptional(property);
    else if (deepkitType.optional) return TypeBox.Optional(property);
    else if (deepkitType.readonly) return TypeBox.Readonly(property);
    else return property;
}
