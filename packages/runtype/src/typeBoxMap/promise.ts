/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TPromise, TSchema, Type as TypeBox} from '@sinclair/typebox';
import {TypePromise} from '@deepkit/type';
import {DeepkitVisitor} from '../typeBoxTypes';

export function resolvePromise(deepkitType: TypePromise, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TPromise {
    const returnSchema: TSchema = resolveTypeBox(deepkitType.type, {});
    return TypeBox.Promise(returnSchema, opts);
}
