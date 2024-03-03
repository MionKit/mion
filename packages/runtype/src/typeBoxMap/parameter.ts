/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema, Type as TypeBox} from '@sinclair/typebox';
import {TypeParameter} from '@deepkit/type';
import {DeepkitVisitor} from '../types';

export function resolveParameter(deepkitType: TypeParameter, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TSchema {
    // we ignore the visibility of the type parameter as private parameters in the Constructor are still required to be passed
    const paramOpts = deepkitType.default ? {...opts, default: deepkitType.default()} : opts;
    const param: TSchema = resolveTypeBox(deepkitType.type, paramOpts);

    if (deepkitType.optional && deepkitType.readonly) return TypeBox.ReadonlyOptional(param);
    else if (deepkitType.optional) return TypeBox.Optional(param);
    else if (deepkitType.readonly) return TypeBox.Readonly(param);
    else return param;
}
