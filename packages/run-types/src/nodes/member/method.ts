/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethod} from '@deepkit/type';
import {FunctionRunType} from '../function/function.ts';
import {RunTypeChildAccessor} from '../../types.ts';
import {getPropIndex, getPropLiteral, getPropVarName, useArrayAccessorForProp} from '../../lib/utils.ts';
import type {JitFnCompiler} from '../../lib/jitFnCompiler.ts';

export class MethodRunType extends FunctionRunType<TypeMethod> implements RunTypeChildAccessor {
    getChildIndex = (comp: JitFnCompiler) => {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getPropIndex(this.src) - start;
        return getPropIndex(this.src);
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitFnCompiler) {
        return getPropVarName(this.src.name);
    }
    getChildLiteral(comp: JitFnCompiler) {
        return getPropLiteral(this.getChildVarName(comp));
    }
    useArrayAccessor() {
        return useArrayAccessorForProp(this.src.name);
    }
    isOptional = () => !!this.src.optional;
}
