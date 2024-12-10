/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeTuple} from '../../lib/_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {AnyParameterListRunType, MockOperation, SrcType} from '../../types';
import {ParameterRunType} from '../member/param';
import {ReflectionKind} from '../../lib/_deepkit/src/reflection/type';
import {CollectionRunType} from '../../lib/baseRunTypes';
import {TupleMemberRunType} from '../member/tupleMember';

type AnyParamRunType = ParameterRunType | TupleMemberRunType;

export class TupleRunType<ParamList extends AnyParameterListRunType = TypeTuple> extends CollectionRunType<ParamList> {
    getSrcParamList(): SrcType[] {
        if (this.src.kind === ReflectionKind.tuple) return this.src.types as SrcType[];
        return (this.src.parameters as SrcType[]) || [];
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

    _compileIsType(comp: JitCompiler) {
        const children = this.getChildRunTypes();
        if (children.length === 0) return `Array.isArray(${comp.vλl}) && ${comp.vλl}.length === 0`;
        const lengthCode = this.hasRestParameter() ? '' : `&& ${comp.vλl}.length <= ${this.getChildRunTypes().length}`;
        const paramsCode = children.map((p) => `(${p.compileIsType(comp)})`).join(' && ');
        return `(Array.isArray(${comp.vλl})${lengthCode} && ${paramsCode})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler) {
        const children = this.getChildRunTypes();
        if (children.length === 0)
            return `if (!Array.isArray(${comp.vλl}) || && ${comp.vλl}.length === 0) ${comp.callJitErr(this)}`;
        const lengthCode = this.hasRestParameter() ? '' : `|| ${comp.vλl}.length > ${this.getChildRunTypes().length}`;
        const paramsCode = children.map((p) => p.compileTypeErrors(comp)).join(';');
        return `if (!Array.isArray(${comp.vλl})${lengthCode}) ${comp.callJitErr(this)}; else {${paramsCode}}`;
    }
    _compileJsonEncode(comp: JitCompiler) {
        const children = this.getChildRunTypes();
        if (!children.length) return undefined;
        const code = children
            .map((p) => p.compileJsonEncode(comp))
            .filter(Boolean)
            .join(';');
        return code || undefined;
    }
    _compileJsonDecode(comp: JitCompiler) {
        const children = this.getChildRunTypes();
        if (!children.length) return undefined;
        return (
            children
                .map((p) => p.compileJsonDecode(comp))
                .filter(Boolean)
                .join(';') || undefined
        );
    }
    _compileJsonStringify(comp: JitCompiler) {
        const skip = this.getJitConfig().skipJit;
        if (skip) return '';
        if (this.getChildRunTypes().length === 0) return `[]`;
        const paramsCode = this.getChildRunTypes()
            .map((p) => p.compileJsonStringify(comp))
            .join('+');
        return `'['+${paramsCode}+']'`;
    }

    _mock(ctx: MockOperation) {
        const options = this.src.kind === ReflectionKind.tuple ? ctx.tupleOptions : ctx.paramsOptions;
        const params = this.getChildRunTypes().map((p, i) => p.mock(options?.[i] || ctx));
        if (this.hasRestParameter()) {
            return [...params.slice(0, -1), ...params[params.length - 1]];
        }
        return params;
    }
}
