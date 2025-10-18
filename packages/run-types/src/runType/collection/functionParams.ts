/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeFunction, TypeTuple} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {AnyParameterListRunType, SrcType, jitCode} from '../../types';
import {ParameterRunType} from '../member/param';
import {CollectionRunType} from '../../lib/baseRunTypes';
import {TupleMemberRunType} from '../member/tupleMember';

type AnyParamRunType = ParameterRunType | TupleMemberRunType;

export class FunctionParamsRunType<
    ParamList extends AnyParameterListRunType = TypeFunction,
> extends CollectionRunType<ParamList> {
    getChildRunTypes = (): AnyParamRunType[] => {
        const childTypes = ((this.src as TypeFunction).parameters || (this.src as TypeTuple).types || []) as SrcType[];
        return childTypes.map((t) => t._rt as AnyParamRunType);
    };
    getParamRunTypes(comp: JitCompiler): AnyParamRunType[] {
        const start = comp.opts?.paramsSlice?.start;
        const end = comp.opts?.paramsSlice?.end;
        const children = this.getChildRunTypes();
        if (!start && !end) return children;
        // Get all child run types first without using comp to avoid recursion
        return children.slice(start, end);
    }
    hasRestParameter(comp: JitCompiler): boolean {
        return (
            !!this.getParamRunTypes(comp).length && this.getParamRunTypes(comp)[this.getParamRunTypes(comp).length - 1].isRest()
        );
    }
    totalRequiredParams(comp: JitCompiler): number {
        return this.getParamRunTypes(comp).filter((p) => !p.isOptional() && !p.isRest()).length;
    }
    // ####### params #######

    _compileIsType(comp: JitCompiler): jitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) return {code: `${comp.vλl}.length === 0`, type: 'E'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `${comp.vλl}.length <= ${children.length}`;
        // Only include parameters that require validation
        const paramsCode = children.map((p) => p.compileIsType(comp)?.code).filter(Boolean);
        if (paramsCode.length === 0) return lengthCode ? {code: `(${lengthCode})`, type: 'E'} : {code: undefined, type: 'E'};
        return lengthCode
            ? {code: `(${lengthCode} && ${paramsCode.join(' && ')})`, type: 'E'}
            : {code: `(${paramsCode.join(' && ')})`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) return {code: `if (${comp.vλl}.length !== 0) ${comp.callJitErr(this)}`, type: 'S'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `${comp.vλl}.length > ${children.length}`;

        // Only include parameters that require validation
        const paramsCode = children.map((p) => p.compileTypeErrors(comp)?.code).filter(Boolean);
        if (paramsCode.length === 0)
            return lengthCode ? {code: `if (${lengthCode}) ${comp.callJitErr(this)}`, type: 'S'} : {code: undefined, type: 'S'};
        return lengthCode
            ? {code: `if (${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode.join(';')}}`, type: 'S'}
            : {code: paramsCode.join(';'), type: 'S'};
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const children = this.getParamRunTypes(comp);
        if (!children.length) return undefined;
        const code = children
            .map((p) => p.compileToJsonVal(comp))
            .filter(Boolean)
            .join(';');
        return code || undefined;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const children = this.getParamRunTypes(comp);
        if (!children.length) return undefined;
        return (
            children
                .map((p) => p.compileFromJsonVal(comp))
                .filter(Boolean)
                .join(';') || undefined
        );
    }
}
