/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {RunTypeVisitor} from '../types';
import {FunctionRunType} from './function';

export class MethodSignatureRunType extends FunctionRunType<TypeMethodSignature> {
    constructor(
        public readonly src: TypeMethodSignature,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number,
        callType = 'method'
    ) {
        super(src, visitor, nestLevel, callType);
    }
}
