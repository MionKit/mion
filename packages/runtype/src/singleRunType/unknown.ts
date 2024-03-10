/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnknown} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {AnyRunType} from './any';

export class UnknownRunType extends AnyRunType implements RunType<TypeUnknown> {
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeUnknown,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts, 'unknown');
    }
}
