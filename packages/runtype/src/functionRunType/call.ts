/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeCallSignature} from '../_deepkit/src/reflection/type';
import {RunTypeVisitor} from '../types';
import {FunctionRunType} from './function';

export class CallSignatureRunType extends FunctionRunType<TypeCallSignature> {
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeCallSignature,
        public readonly nestLevel: number,
        callType = 'call'
    ) {
        super(visitor, src, nestLevel, callType);
    }
}
