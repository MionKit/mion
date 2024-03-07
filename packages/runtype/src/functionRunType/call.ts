/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeCallSignature} from '@deepkit/type';
import {RunTypeVisitor} from '../types';
import {FunctionRunType} from './function';

export class CallSignatureRunType extends FunctionRunType<TypeCallSignature> {
    constructor(
        public readonly src: TypeCallSignature,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number,
        callType = 'call'
    ) {
        super(src, visitor, nestLevel, callType);
    }
}
