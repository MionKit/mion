/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor} from '../types';
import {FunctionRunType} from './function';

export class MethodSignatureRunType extends FunctionRunType<TypeMethodSignature> {
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeMethodSignature,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions,
        callType = 'methodSignature'
    ) {
        super(visitor, src, nestLevel, opts, callType);
    }
}
