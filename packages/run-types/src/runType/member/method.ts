/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeMethod} from '@deepkit/type';
import {FunctionRunType} from '../function/function';
import {RunTypeChildAccessor} from '../../types';
import {getPropIndex, getPropLiteral, getPropVarName, useArrayAccessorForProp} from '../../lib/utils';
import type {JitCompiler} from '../../lib/jitCompiler';

export class MethodRunType extends FunctionRunType<TypeMethod> implements RunTypeChildAccessor {
    getChildIndex = (comp: JitCompiler) => {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getPropIndex(this.src) - start;
        return getPropIndex(this.src);
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitCompiler) {
        return getPropVarName(this.src.name);
    }
    getChildLiteral(comp: JitCompiler) {
        return getPropLiteral(this.getChildVarName(comp));
    }
    useArrayAccessor() {
        return useArrayAccessorForProp(this.src.name);
    }
    isOptional = () => !!this.src.optional;
}
