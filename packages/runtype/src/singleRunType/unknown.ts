/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnknown} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';
import {AnyRunType} from './any';

export class UnknownRunType extends AnyRunType implements RunType<TypeUnknown> {
    constructor(
        public readonly src: TypeUnknown,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor,
        public readonly nestLevel: number
    ) {
        super(src, visitor, path, nestLevel);
    }
}
