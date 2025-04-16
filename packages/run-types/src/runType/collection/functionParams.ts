/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeFunction} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {AnyParameterListRunType, SrcType, jitCode} from '../../types';
import {ParameterRunType} from '../member/param';
import {ReflectionKind} from '@deepkit/type';
import {CollectionRunType} from '../../lib/baseRunTypes';
import {TupleMemberRunType} from '../member/tupleMember';
import {ReflectionSubKind} from '../../constants.kind';

type AnyParamRunType = ParameterRunType | TupleMemberRunType;

export class FunctionParamsRunType<
    ParamList extends AnyParameterListRunType = TypeFunction,
> extends CollectionRunType<ParamList> {
    getSrcParamList(): SrcType[] {
        if (this.src.subKind === ReflectionSubKind.params) return ((this.src as TypeFunction).parameters as SrcType[]) || [];
        if (this.src.kind === ReflectionKind.function) return ((this.src as TypeFunction).parameters as SrcType[]) || [];
        throw new Error('Invalid FunctionParamsRunType');
    }
    getChildRunTypes = (comp?: JitCompiler): AnyParamRunType[] => {
        const start = comp?.opts?.paramsSlice?.start;
        const end = comp?.opts?.paramsSlice?.end;
        const children = this.getSrcParamList().map((t) => t._rt as AnyParamRunType);
        if (!start && !end) return children;
        // Get all child run types first without using comp to avoid recursion
        return children.slice(start, end);
    };
    hasRestParameter(): boolean {
        return !!this.getChildRunTypes().length && this.getChildRunTypes()[this.getChildRunTypes().length - 1].isRest();
    }
    totalRequiredParams(): number {
        return this.getChildRunTypes().filter((p) => !p.isOptional() && !p.isRest()).length;
    }
    // ####### params #######

    _compileIsType(comp: JitCompiler): jitCode {
        const children = this.getChildRunTypes(comp);
        if (children.length === 0) return `${comp.vλl}.length === 0`;
        const lengthCode = this.hasRestParameter() ? '' : `${comp.vλl}.length <= ${children.length}`;
        // Only include parameters that require validation
        const paramsCode = children.map((p) => p.compileIsType(comp)).filter(Boolean);
        if (paramsCode.length === 0) return lengthCode ? `(${lengthCode})` : undefined;
        return lengthCode ? `(${lengthCode} && ${paramsCode.join(' && ')})` : `(${paramsCode.join(' && ')})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const children = this.getChildRunTypes(comp);
        if (children.length === 0) return `if (${comp.vλl}.length !== 0) ${comp.callJitErr(this)}`;
        const lengthCode = this.hasRestParameter() ? '' : `${comp.vλl}.length > ${children.length}`;

        // Only include parameters that require validation
        const paramsCode = children.map((p) => p.compileTypeErrors(comp)).filter(Boolean);
        if (paramsCode.length === 0) return lengthCode ? `if (${lengthCode}) ${comp.callJitErr(this)}` : undefined;
        return lengthCode ? `if (${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode.join(';')}}` : paramsCode.join(';');
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const children = this.getChildRunTypes(comp);
        if (!children.length) return undefined;
        const code = children
            .map((p) => p.compileToJsonVal(comp))
            .filter(Boolean)
            .join(';');
        return code || undefined;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const children = this.getChildRunTypes(comp);
        if (!children.length) return undefined;
        return (
            children
                .map((p) => p.compileFromJsonVal(comp))
                .filter(Boolean)
                .join(';') || undefined
        );
    }
}
