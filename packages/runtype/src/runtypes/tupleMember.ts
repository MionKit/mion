/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema} from '@sinclair/typebox';
import {TypeTupleMember} from '@deepkit/type';
import {DeepkitVisitor} from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveTupleMember(member: TypeTupleMember, opts: SchemaOptions, resolveTypeBox: DeepkitVisitor): TSchema {
    // The 'type' property of TypeTupleMember describes the type of this tuple member.
    throw new Error('Not implemented');
}
