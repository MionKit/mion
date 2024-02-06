/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema, TTuple, Type as TypeBox} from '@sinclair/typebox';
import {TypeTuple} from '@deepkit/type';
import {DeepkitVisitor} from '../types';

export function resolveTuple(deepkitType: TypeTuple, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TTuple {
    // Map each TypeTupleMember to a corresponding TypeBox schema using the mapTupleMember function.
    const itemTypes: TSchema[] = deepkitType.types.map((member) => resolveTypeBox(member, {}));
    return TypeBox.Tuple(itemTypes, opts);
}
