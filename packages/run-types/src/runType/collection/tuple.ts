/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeTuple} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {AnyParameterListRunType, JitCode} from '../../types';
import {FunctionParamsRunType} from './functionParams';

export class TupleRunType<ParamList extends AnyParameterListRunType = TypeTuple> extends FunctionParamsRunType<ParamList> {
    visitIsType(comp: JitCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) return {code: `Array.isArray(${comp.vλl}) && ${comp.vλl}.length === 0`, type: 'E'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `&& ${comp.vλl}.length <= ${this.getParamRunTypes(comp).length}`;
        const paramsCode = children.map((p) => `(${p.compileIsType(comp, 'E').code})`).join(' && ');
        return {code: `(Array.isArray(${comp.vλl})${lengthCode} && ${paramsCode})`, type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0)
            return {code: `if (!Array.isArray(${comp.vλl}) || && ${comp.vλl}.length === 0) ${comp.callJitErr(this)}`, type: 'S'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `|| ${comp.vλl}.length > ${this.getParamRunTypes(comp).length}`;
        const paramsCode = children.map((p) => p.compileTypeErrors(comp, 'S').code).join(';');
        return {code: `if (!Array.isArray(${comp.vλl})${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode}}`, type: 'S'};
    }
}
