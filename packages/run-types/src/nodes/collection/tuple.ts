/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeFunction, TypeTuple} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {AnyParameterListRunType, SrcType, JitCode} from '../../types';
import {ParameterRunType} from '../member/param';
import {CollectionRunType} from '../../lib/baseRunTypes';
import {TupleMemberRunType} from '../member/tupleMember';

type AnyParamRunType = ParameterRunType | TupleMemberRunType;

export class TupleRunType<
    ParamList extends AnyParameterListRunType = TypeTuple,
    ParamType extends AnyParamRunType = TupleMemberRunType,
> extends CollectionRunType<ParamList> {
    getChildRunTypes = (): ParamType[] => {
        const childTypes = ((this.src as TypeFunction).parameters || (this.src as TypeTuple).types || []) as SrcType[];
        return childTypes.map((t) => t._rt as ParamType);
    };
    getParamRunTypes(comp: JitFnCompiler): ParamType[] {
        const start = comp.opts?.paramsSlice?.start;
        const end = comp.opts?.paramsSlice?.end;
        const children = this.getChildRunTypes();
        if (!start && !end) return children;
        // Get all child run types first without using comp to avoid recursion
        return children.slice(start, end);
    }
    hasRestParameter(comp: JitFnCompiler): boolean {
        return (
            !!this.getParamRunTypes(comp).length && this.getParamRunTypes(comp)[this.getParamRunTypes(comp).length - 1].isRest()
        );
    }
    totalRequiredParams(comp: JitFnCompiler): number {
        return this.getParamRunTypes(comp).filter((p) => !p.isOptional() && !p.isRest()).length;
    }
    // ####### params #######

    emitIsType(comp: JitFnCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0) return {code: `Array.isArray(${comp.vλl}) && ${comp.vλl}.length === 0`, type: 'E'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `&& ${comp.vλl}.length <= ${this.getParamRunTypes(comp).length}`;
        const paramsCode = children.map((p) => `(${comp.compileIsType(p, 'E').code})`).join(' && ');
        return {code: `(Array.isArray(${comp.vλl})${lengthCode} && ${paramsCode})`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (children.length === 0)
            return {code: `if (!Array.isArray(${comp.vλl}) || && ${comp.vλl}.length === 0) ${comp.callJitErr(this)}`, type: 'S'};
        const lengthCode = this.hasRestParameter(comp) ? '' : `|| ${comp.vλl}.length > ${this.getParamRunTypes(comp).length}`;
        const paramsCode = children.map((p) => comp.compileTypeErrors(p, 'S').code).join(';');
        return {code: `if (!Array.isArray(${comp.vλl})${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode}}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (!children.length) return {code: undefined, type: 'S'};
        const code = children
            .map((p) => comp.compilePrepareForJson(p, 'S').code)
            .filter(Boolean)
            .join(';');
        return {code: code, type: 'S'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        const children = this.getParamRunTypes(comp);
        if (!children.length) return {code: undefined, type: 'S'};
        const code = children
            .map((p) => comp.compileRestoreFromJson(p, 'S').code)
            .filter(Boolean)
            .join(';');
        return {code: code, type: 'S'};
    }
}
