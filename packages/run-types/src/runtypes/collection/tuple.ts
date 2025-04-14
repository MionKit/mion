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
import {ReflectionKind} from '@deepkit/type';
import {CollectionRunType} from '../../lib/baseRunTypes';
import {TupleMemberRunType} from '../member/tupleMember';
import {ReflectionSubKind} from '../../constants.kind';

type AnyParamRunType = ParameterRunType | TupleMemberRunType;

export class TupleRunType<ParamList extends AnyParameterListRunType = TypeTuple> extends CollectionRunType<ParamList> {
    getSrcParamList(): SrcType[] {
        if (this.src.subKind === ReflectionSubKind.params) return ((this.src as TypeFunction).parameters as SrcType[]) || [];
        if (this.src.kind === ReflectionKind.tuple) return this.src.types as SrcType[];
        throw new Error('Invalid TupleRunType');
    }
    getChildRunTypes = (): AnyParamRunType[] => {
        return this.getSrcParamList().map((t) => t._rt as AnyParamRunType);
    };
    hasRestParameter(): boolean {
        return !!this.getChildRunTypes().length && this.getChildRunTypes()[this.getChildRunTypes().length - 1].isRest();
    }
    totalRequiredParams(): number {
        return this.getChildRunTypes().filter((p) => !p.isOptional() && !p.isRest()).length;
    }
    // ####### params #######

    _compileIsType(comp: JitCompiler): jitCode {
        const children = this.getChildRunTypes();
        if (children.length === 0) return `Array.isArray(${comp.vλl}) && ${comp.vλl}.length === 0`;
        const lengthCode = this.hasRestParameter() ? '' : `&& ${comp.vλl}.length <= ${this.getChildRunTypes().length}`;
        const paramsCode = children.map((p) => `(${p.compileIsType(comp)})`).join(' && ');
        return `(Array.isArray(${comp.vλl})${lengthCode} && ${paramsCode})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const children = this.getChildRunTypes();
        if (children.length === 0)
            return `if (!Array.isArray(${comp.vλl}) || && ${comp.vλl}.length === 0) ${comp.callJitErr(this)}`;
        const lengthCode = this.hasRestParameter() ? '' : `|| ${comp.vλl}.length > ${this.getChildRunTypes().length}`;
        const paramsCode = children.map((p) => p.compileTypeErrors(comp)).join(';');
        return `if (!Array.isArray(${comp.vλl})${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode}}`;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const children = this.getChildRunTypes();
        if (!children.length) return undefined;
        const code = children
            .map((p) => p.compileToJsonVal(comp))
            .filter(Boolean)
            .join(';');
        return code || undefined;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const children = this.getChildRunTypes();
        if (!children.length) return undefined;
        return (
            children
                .map((p) => p.compileFromJsonVal(comp))
                .filter(Boolean)
                .join(';') || undefined
        );
    }
}
