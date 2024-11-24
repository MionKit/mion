import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {AnyFunction, MockOperation, SrcType} from '../../types';
import {getExpected, getJitErrorPath, toLiteral} from '../../lib/utils';
import {ParameterRunType} from '../member/param';
import {TypeFunction} from '../../lib/_deepkit/src/reflection/type';
import {BaseRunType, CollectionRunType} from '../../lib/baseRunTypes';

export class FunctionParametersRunType<CallType extends AnyFunction = TypeFunction> extends CollectionRunType<CallType> {
    getName = (): string => 'fnParams';
    getChildRunTypes = (): BaseRunType[] => {
        const childTypes = (this.src.parameters as SrcType[]) || []; // deepkit stores child types in the types property
        return childTypes.map((t) => t._rt as BaseRunType);
    };
    getParameterTypes(): ParameterRunType[] {
        return this.getChildRunTypes() as ParameterRunType[];
    }
    getTotalParams(): number {
        return this.getParameterTypes().length;
    }
    /** returns the number of parameters of the function, follows same logic as Function.prototype.length
     * rest parameter is ignored, only counts until first parameter with default values */
    getLength(): number {
        const lastIndex = this.getParameterTypes().findIndex((p) => p.hasDefaultValue() || p.isRest());
        return lastIndex === -1 ? this.getTotalParams() : lastIndex;
    }
    getOptionalParamsLength(): number {
        return this.getParameterTypes().filter((p) => p.isOptional()).length;
    }
    hasRestParameter(): boolean {
        return !!this.getParameterTypes().length && this.getParameterTypes()[this.getParameterTypes().length - 1].isRest();
    }
    paramsLiteral(): string {
        return toLiteral(
            `[${this.getParameterTypes()
                .map((p) => p.getName())
                .join(', ')}]`
        );
    }
    // ####### params #######

    _compileCheckParamsLength(comp: JitCompiler): string {
        const totalOptional = this.getOptionalParamsLength();
        const totalNonOptional = this.getTotalParams() - totalOptional;
        switch (true) {
            case this.hasRestParameter():
                return ``;
            case totalOptional === 0:
                return `${comp.vλl}.length === ${this.getLength()}`;
            default:
                return `${comp.vλl}.length >= ${totalNonOptional} && ${comp.vλl}.length <= ${this.getTotalParams()}`;
        }
    }

    _compileIsType(comp: JitCompiler) {
        if (this.getParameterTypes().length === 0) return `${comp.vλl}.length === 0`;
        const paramsCode = this.getParameterTypes()
            .map((p) => `(${p.compileIsType(comp)})`)
            .join(' && ');
        const lengthCode = this._compileCheckParamsLength(comp);
        const checkLength = lengthCode ? `${lengthCode} && ` : lengthCode;
        return `${checkLength}${paramsCode}`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler) {
        const lengthCode = this._compileCheckParamsLength(comp);
        const checkLength = lengthCode ? ` || !(${lengthCode})` : lengthCode;
        const paramsCode = this.getParameterTypes()
            .map((p) => p.compileTypeErrors(comp))
            .join(';');
        return (
            `if (!Array.isArray(${comp.vλl})${checkLength}) utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)});` +
            `else {${paramsCode}}`
        );
    }
    _compileJsonEncode(comp: JitCompiler) {
        return this.compileParamsJsonDE(comp, true);
    }
    _compileJsonDecode(comp: JitCompiler) {
        return this.compileParamsJsonDE(comp, false);
    }
    _compileJsonStringify(comp: JitCompiler) {
        const skip = this.getJitConstants().skipJit;
        if (skip) return '';
        if (this.getParameterTypes().length === 0) return `[]`;

        const paramsCode = this.getParameterTypes()
            .map((p) => p.compileJsonStringify(comp))
            .join('+');
        return `'['+${paramsCode}+']'`;
    }

    private compileParamsJsonDE(comp: JitCompiler, isEncode: boolean) {
        const skip = isEncode ? this.getJitConstants().skipJsonEncode : this.getJitConstants().skipJsonDecode;
        if (skip) return '';
        return this.getParameterTypes()
            .filter((p) => (isEncode ? p.compileJsonEncode : p.compileJsonDecode))
            .map((p) => (isEncode ? p.compileJsonEncode(comp) : p.compileJsonDecode(comp)))
            .join(';');
    }

    _mock(ctx: MockOperation) {
        return this.getParameterTypes().map((p) => p.mock(ctx));
    }
}
