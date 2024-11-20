import {getExpected, getJitErrorPath, toLiteral} from '../utils';
import {ParameterRunType} from '../memberRunType/param';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {AnyFunction, DKwithRT, MockOperation} from '../types';
import {TypeFunction} from '../_deepkit/src/reflection/type';
import {BaseRunType, CollectionRunType} from '../baseRunTypes';

export class FunctionParametersRunType<CallType extends AnyFunction = TypeFunction> extends CollectionRunType<CallType> {
    src: CallType = null as any; // will be set after construction
    getName = (): string => 'fnParams';
    getChildRunTypes = (): BaseRunType[] => {
        const childTypes = (this.src.parameters as DKwithRT[]) || []; // deepkit stores child types in the types property
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

    _compileCheckParamsLength(cop: JitCompiler): string {
        const totalOptional = this.getOptionalParamsLength();
        const totalNonOptional = this.getTotalParams() - totalOptional;
        switch (true) {
            case this.hasRestParameter():
                return ``;
            case totalOptional === 0:
                return `${cop.vλl}.length === ${this.getLength()}`;
            default:
                return `${cop.vλl}.length >= ${totalNonOptional} && ${cop.vλl}.length <= ${this.getTotalParams()}`;
        }
    }

    _compileIsType(cop: JitCompiler) {
        if (this.getParameterTypes().length === 0) return `${cop.vλl}.length === 0`;
        const paramsCode = this.getParameterTypes()
            .map((p) => `(${p.compileIsType(cop)})`)
            .join(' && ');
        const lengthCode = this._compileCheckParamsLength(cop);
        const checkLength = lengthCode ? `${lengthCode} && ` : lengthCode;
        return `${checkLength}${paramsCode}`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler) {
        const lengthCode = this._compileCheckParamsLength(cop);
        const checkLength = lengthCode ? ` || !(${lengthCode})` : lengthCode;
        const paramsCode = this.getParameterTypes()
            .map((p) => p.compileTypeErrors(cop))
            .join(';');
        return (
            `if (!Array.isArray(${cop.vλl})${checkLength}) utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)});` +
            `else {${paramsCode}}`
        );
    }
    _compileJsonEncode(cop: JitCompiler) {
        return this.compileParamsJsonDE(cop, true);
    }
    _compileJsonDecode(cop: JitCompiler) {
        return this.compileParamsJsonDE(cop, false);
    }
    _compileJsonStringify(cop: JitCompiler) {
        const skip = this.getJitConstants().skipJit;
        if (skip) return '';
        if (this.getParameterTypes().length === 0) return `[]`;

        const paramsCode = this.getParameterTypes()
            .map((p) => p.compileJsonStringify(cop))
            .join('+');
        return `'['+${paramsCode}+']'`;
    }

    private compileParamsJsonDE(cop: JitCompiler, isEncode: boolean) {
        const skip = isEncode ? this.getJitConstants().skipJsonEncode : this.getJitConstants().skipJsonDecode;
        if (skip) return '';
        return this.getParameterTypes()
            .filter((p) => (isEncode ? p.compileJsonEncode : p.compileJsonDecode))
            .map((p) => (isEncode ? p.compileJsonEncode(cop) : p.compileJsonDecode(cop)))
            .join(';');
    }

    _mock(ctx: MockOperation) {
        return this.getParameterTypes().map((p) => p.mock(ctx));
    }
}
