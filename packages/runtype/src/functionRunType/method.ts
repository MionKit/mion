/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethod} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor} from '../types';
import {FunctionRunType} from './function';

export class MethodRunType extends FunctionRunType<TypeMethod> {
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeMethod,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions,
        callType = 'method'
    ) {
        super(visitor, src, nestLevel, opts, callType);
    }
}
