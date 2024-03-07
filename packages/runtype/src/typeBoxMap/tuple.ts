/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema, TTuple, Type as TypeBox} from '@sinclair/typebox';
import {TypeTuple, TypeTupleMember} from '@deepkit/type';
import {DeepkitVisitor} from '../typeBoxTypes';

export function resolveTuple(deepkitType: TypeTuple, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TTuple {
    const itemTypes: TSchema[] = deepkitType.types.map((member) => resolveTypeBox(member, {}));
    return TypeBox.Tuple(itemTypes, opts);
}

export function resolveTupleMember(deepkitType: TypeTupleMember, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TSchema {
    return resolveTypeBox(deepkitType.type, opts);
}
