import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {AnyFunction, MockOperation, SrcType} from '../../types';
import {ParameterRunType} from '../member/param';
import {ReflectionKind, TypeFunction, TypeTuple} from '../../lib/_deepkit/src/reflection/type';
import {CollectionRunType} from '../../lib/baseRunTypes';
import {TupleMemberRunType} from '../member/tupleMember';

type AnyParameterListRunType = AnyFunction | TypeTuple;
type AnyParamRunType = ParameterRunType | TupleMemberRunType;

export class ParameterListRunType<ParamList extends AnyParameterListRunType = TypeFunction> extends CollectionRunType<ParamList> {
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
        return this.getChildRunTypes().map((p) => p.mock(ctx));
    }
}
