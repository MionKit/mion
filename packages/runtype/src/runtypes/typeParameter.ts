/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SchemaOptions, TSchema} from '@sinclair/typebox';
import {TypeTypeParameter} from '@deepkit/type';
import {DeepkitVisitor} from '../types';

// returns property options rather than values
export function resolveTypeParameter(
    deepkitType: TypeTypeParameter,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    opts: SchemaOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resolveTypeBox: DeepkitVisitor
): TSchema {
    // TODO investigate what to do here Typeparameret is the parent of TypeRest
    // TypeRest has parent TypeTypeParameter | TypeTupleMember
    console.log('deepkitType', deepkitType);
    throw new Error('TypeParameter not implemented');
}
