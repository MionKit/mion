/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {jitNames} from '../constants';
import {isPromiseRunType} from '../guards';
import {buildJITFunctions} from '../jitCompiler';
import {JITFunctionsData, JitCompilerFunctions, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {getErrorPath, toLiteral} from '../utils';
import {ParameterRunType} from './param';

type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;

export class FunctionRunType<CallType extends AnyFunction = TypeFunction> extends BaseRunType<CallType> {
    public readonly isJsonEncodeRequired = true; // triggers custom json encode so functions get skipped
    public readonly isJsonDecodeRequired = true; // triggers custom json encode so functions get skipped
    public readonly isReturnJsonEncodedRequired: boolean;
    public readonly isReturnJsonDecodedRequired: boolean;
    public readonly isParamsJsonEncodedRequired: boolean;
    public readonly isParamsJsonDecodedRequired: boolean;
    public readonly returnType: RunType;
    public readonly parameterTypes: ParameterRunType[];
    public readonly shouldSerialize = false;
    public readonly hasReturnData: boolean;
    public readonly hasOptionalParameters: boolean;
    public readonly isAsync: boolean;
    public readonly totalRequiredParams: number;
    public readonly hasRestParameter: boolean;
    public readonly paramsName: string;
    public readonly jitId: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: CallType,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        const start = opts?.paramsSlice?.start;
        const end = opts?.paramsSlice?.end;
        const maybePromiseReturn = visitor(src.return, parents, opts);
        const isPromise = isPromiseRunType(maybePromiseReturn);
        this.returnType = isPromise ? maybePromiseReturn.resolvedType : maybePromiseReturn;
        this.parameterTypes = src.parameters.slice(start, end).map((p) => visitor(p, parents, opts)) as ParameterRunType[];
        this.totalRequiredParams = this.parameterTypes.reduce((acc, p) => acc + (p.isOptional ? 0 : 1), 0);
        this.isReturnJsonEncodedRequired = this.returnType.isJsonEncodeRequired;
        this.isReturnJsonDecodedRequired = this.returnType.isJsonDecodeRequired;
        this.isParamsJsonEncodedRequired = this.parameterTypes.some((p) => p.isJsonEncodeRequired);
        this.isParamsJsonDecodedRequired = this.parameterTypes.some((p) => p.isJsonDecodeRequired);
        this.hasOptionalParameters = this.totalRequiredParams < this.parameterTypes.length;
        this.hasRestParameter = !!this.parameterTypes.length && this.parameterTypes[this.parameterTypes.length - 1].isRest;
        this.hasReturnData = this._hasReturnData(this.returnType.src.kind);
        this.isAsync = isPromise || this._isAsync(this.returnType.src.kind);
        this.paramsName = `[${this.parameterTypes.map((p) => p.getName()).join(', ')}]`;
        this.jitId = 'function'; // will be overridden later
    }

    private _jitId: string | undefined;
    getJitId(): string {
        if (this._jitId) return this._jitId;
        return (this._jitId = `${this.src.kind}(${this.parameterTypes.map((p) => p.jitId).join(',')}):${this.returnType.jitId}`);
    }
    compileIsType(): string {
        throw new Error(`${this.getName()} validation is not supported, instead validate parameters or return type separately.`);
    }
    compileTypeErrors(): string {
        throw new Error(`${this.getName()} validation is not supported, instead validate parameters or return type separately.`);
    }
    compileJsonEncode(): string {
        throw new Error(`${this.getName()} json encode is not supported, instead encode parameters or return type separately.`);
    }
    compileJsonDecode(): string {
        throw new Error(`${this.getName()} json decode is not supported, instead decode parameters or return type separately.`);
    }
    compileJsonStringify(): string {
        throw new Error(
            `${this.getName()} json stringify is not supported, instead stringify parameters or return type separately.`
        );
    }
    mock(): string {
        throw new Error(`${this.getName()} mock is not supported, instead mock parameters or return type separately.`);
    }

    // ####### params #######

    private _jitParamsFns: JITFunctionsData | undefined;
    get jitParamsFns(): JITFunctionsData {
        if (this._jitParamsFns) return this._jitParamsFns;
        return (this._jitParamsFns = buildJITFunctions(this, this._paramsJitFunctions));
    }

    private _paramsJitFunctions: JitCompilerFunctions = {
        compileIsType: (parents: RunType[], varName: string) => {
            if (this.parameterTypes.length === 0) return `${varName}.length === 0`;
            const paramsCode = this.parameterTypes
                .map((p, i) => `(${p.compileIsType([...parents, this], varName, i)})`)
                .join(' && ');
            const maxLength = !this.hasRestParameter ? `&& ${varName}.length <= ${this.parameterTypes.length}` : '';
            const checkLength = `${varName}.length >= ${this.totalRequiredParams} ${maxLength}`;
            return `${checkLength} && ${paramsCode}`;
        },
        compileTypeErrors: (parents: RunType[], varName: string, pathC: (string | number)[]) => {
            const maxLength = !this.hasRestParameter ? `|| ${varName}.length > ${this.parameterTypes.length}` : '';
            const checkLength = `(${varName}.length < ${this.totalRequiredParams} ${maxLength})`;
            const paramsCode = this.parameterTypes.map((p, i) => p.compileTypeErrors([...parents, this], varName, pathC, i)).join(';');
            return (
                `if (!Array.isArray(${varName}) || ${checkLength}) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${toLiteral(this.paramsName)}});` +
                `else {${paramsCode}}`
            );
        },
        compileJsonEncode: (parents: RunType[], varName: string) => {
            if (!this.opts?.strictJSON && !this.isParamsJsonEncodedRequired) return '';
            return this.parameterTypes
                .map((p, i) => p.compileJsonEncode([...parents, this], varName, i))
                .filter((code) => !!code)
                .join(';');
        },
        compileJsonDecode: (parents: RunType[], varName: string) => {
            if (!this.opts?.strictJSON && !this.isParamsJsonDecodedRequired) return '';
            return this.parameterTypes
                .map((p, i) => p.compileJsonDecode([...parents, this], varName, i))
                .filter((code) => !!code)
                .join(';');
        },
        compileJsonStringify: (parents: RunType[], varName: string) => {
            if (this.parameterTypes.length === 0) return `[]`;
            const paramsCode = this.parameterTypes
                .map((p, i) => p.compileJsonStringify([...parents, this], varName, i))
                .join('+');
            return `'['+${paramsCode}+']'`;
        },
    };

    paramsMock(): any[] {
        return this.parameterTypes.map((p) => p.mock());
    }

    // ####### return #######

    private _jitReturnFns: JITFunctionsData | undefined;
    get jitReturnFns(): JITFunctionsData {
        if (this._jitReturnFns) return this._jitReturnFns;
        return (this._jitReturnFns = buildJITFunctions(this, this._returnJitFunctions));
    }

    private _returnJitFunctions: JitCompilerFunctions = {
        compileIsType: (parents: RunType[], varName) => {
            return this.returnType.compileIsType([...parents, this], varName);
        },
        compileTypeErrors: (parents: RunType[], varName: string, pathC: (string | number)[]) => {
            return this.returnType.compileTypeErrors([...parents, this], varName, pathC);
        },
        compileJsonEncode: (parents: RunType[], varName: string) => {
            if (!this.opts?.strictJSON && !this.isReturnJsonEncodedRequired) return '';
            return this.returnType.compileJsonEncode([...parents, this], varName);
        },
        compileJsonDecode: (parents: RunType[], varName: string) => {
            if (!this.opts?.strictJSON && !this.isReturnJsonDecodedRequired) return '';
            return this.returnType.compileJsonDecode([...parents, this], varName);
        },
        compileJsonStringify: (parents: RunType[], varName: string) =>
            this.returnType.compileJsonStringify([...parents, this], varName),
    };

    returnMock(): any {
        return this.returnType.mock();
    }

    private _hasReturnData(returnKind: ReflectionKind): boolean {
        return (
            returnKind !== ReflectionKind.void && returnKind !== ReflectionKind.never && returnKind !== ReflectionKind.undefined
        );
    }

    private _isAsync(returnKind: ReflectionKind): boolean {
        return (
            returnKind === ReflectionKind.promise || returnKind === ReflectionKind.any || returnKind === ReflectionKind.unknown
        );
    }
}
