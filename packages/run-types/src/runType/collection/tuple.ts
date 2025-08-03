/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeTuple} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {AnyParameterListRunType, jitCode} from '../../types';
import {FunctionParamsRunType} from '@mionkit/run-types/src/runType/collection/functionParams';

export class TupleRunType<ParamList extends AnyParameterListRunType = TypeTuple> extends FunctionParamsRunType<ParamList> {
    _compileIsType(comp: JitCompiler): jitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) {
            return {
                code: `Array.isArray(${comp.vλl}) && ${comp.vλl}.length === 0`,
                codeType: 'E',
                skipJit: false
            };
        }
        const lengthCode = this.hasRestParameter(comp) ? '' : `&& ${comp.vλl}.length <= ${this.getParamRunTypes(comp).length}`;
        const childJitCodes = children.map((p) => p.compileIsType(comp)).filter(Boolean);
        const paramsCode = childJitCodes.map(c => `(${c!.code})`).join(' && ');
        return {
            code: `(Array.isArray(${comp.vλl})${lengthCode} && ${paramsCode})`,
            codeType: 'E',
            skipJit: false,
            children: childJitCodes
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) {
            return {
                code: `if (!Array.isArray(${comp.vλl}) || ${comp.vλl}.length !== 0) ${comp.callJitErr(this)}`,
                codeType: 'S',
                skipJit: false
            };
        }
        const lengthCode = this.hasRestParameter(comp) ? '' : `|| ${comp.vλl}.length > ${this.getParamRunTypes(comp).length}`;
        const childJitCodes = children.map((p) => p.compileTypeErrors(comp)).filter(Boolean);
        const paramsCode = childJitCodes.map(c => c!.code).join(';');
        return {
            code: `if (!Array.isArray(${comp.vλl})${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode}}`,
            codeType: 'S',
            skipJit: false,
            children: childJitCodes
        };
    }
}
