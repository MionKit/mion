/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethodSignature} from '@deepkit/type';
import {JitCompilerOpts, RunTypeChildAccessor} from '../../types';
import {FunctionRunType} from '../function/function';
import {getPropIndex, getPropLiteral, getPropVarName, memorize, useArrayAccessorForProp} from '../../lib/utils';

export class MethodSignatureRunType extends FunctionRunType<TypeMethodSignature> implements RunTypeChildAccessor {
    getChildIndex = (comp?: JitCompilerOpts) => {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getPropIndex(this.src) - start;
        return getPropIndex(this.src);
    };
    getChildVarName = memorize(() => getPropVarName(this.src.name));
    getChildLiteral = memorize(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memorize(() => useArrayAccessorForProp(this.src.name));
    isOptional = () => !!this.src.optional;
}
