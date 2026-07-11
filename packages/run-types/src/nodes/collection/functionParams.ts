/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeFunction} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import type {AnyParameterListRunType, JitCode} from '../../types.ts';
import {TupleRunType} from './tuple.ts';
import {ParameterRunType} from '../member/param.ts';

export class FunctionParamsRunType<ParamList extends AnyParameterListRunType = TypeFunction> extends TupleRunType<
    ParamList,
    ParameterRunType
> {
    emitIsType(comp: JitFnCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) return {code: `${comp.vλl}.length === 0`, type: 'E'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `${comp.vλl}.length <= ${children.length}`;
        // Only include parameters that require validation
        const paramsCode = children.map((p) => comp.compileIsType(p, 'E').code).filter(Boolean);
        if (paramsCode.length === 0) return lengthCode ? {code: `(${lengthCode})`, type: 'E'} : {code: undefined, type: 'E'};
        return lengthCode
            ? {code: `(${lengthCode} && ${paramsCode.join(' && ')})`, type: 'E'}
            : {code: `(${paramsCode.join(' && ')})`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) return {code: `if (${comp.vλl}.length !== 0) ${comp.callJitErr(this)}`, type: 'S'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `${comp.vλl}.length > ${children.length}`;

        // Only include parameters that require validation
        const paramsCode = children.map((p) => comp.compileTypeErrors(p, 'S').code).filter(Boolean);
        if (paramsCode.length === 0)
            return lengthCode ? {code: `if (${lengthCode}) ${comp.callJitErr(this)}`, type: 'S'} : {code: undefined, type: 'S'};
        return lengthCode
            ? {code: `if (${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode.join(';')}}`, type: 'S'}
            : {code: paramsCode.join(';'), type: 'S'};
    }
}
