/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeCallSignature} from '@deepkit/type';
import {JitCompilerOpts, RunTypeChildAccessor} from '../../types';
import {getPropIndex} from '../../lib/utils';
import {FunctionRunType} from '../function/function';

/**
 * Represents a call signature.
 * Call signature is an special node within in interface or object literal that represents a function signature but can have extra properties.
 * ie:
 * type  = {
 *  (a: number, b: boolean): string; // call signature node
 *  popA: number;
 * }
 *
 * So when a call signature is present the parent object literal or interface is considered a function.
 */
export class CallSignatureRunType extends FunctionRunType<TypeCallSignature> implements RunTypeChildAccessor {
    getChildIndex = (comp?: JitCompilerOpts) => {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getPropIndex(this.src) - start;
        return getPropIndex(this.src);
    };
    getChildVarName = () => '';
    getChildLiteral = () => '""';
    useArrayAccessor = () => false;
    isOptional = () => false;
}
