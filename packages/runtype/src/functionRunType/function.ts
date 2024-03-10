/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeCallSignature, TypeFunction, TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';

export interface FnRunTypeOptions extends RunTypeOptions {
    /** skip parameters parsing from the beginning of the function */
    slice?: {start?: number; end?: number};
}

export class FunctionRunType<CallType extends TypeMethodSignature | TypeCallSignature | TypeFunction> extends BaseRunType<
    CallType,
    FnRunTypeOptions
> {
    public readonly isJsonEncodeRequired = true; // triggers custom json encode so functions get skipped
    public readonly isJsonDecodeRequired = true; // triggers custom json encode so functions get skipped
    public readonly shouldEncodeReturnJson: boolean;
    public readonly shouldDecodeReturnJson: boolean;
    public readonly shouldEncodeParamsJson: boolean;
    public readonly shouldDecodeParamsJson: boolean;
    public readonly returnType: RunType;
    public readonly parameterTypes: RunType[];
    public readonly name: string;
    public readonly shouldSerialize = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: CallType,
        public readonly nestLevel: number,
        public readonly opts: FnRunTypeOptions,
        callType = 'function'
    ) {
        super(visitor, src, nestLevel, opts);
        const start = opts?.slice?.start;
        const end = opts?.slice?.end;
        this.returnType = visitor(src.return, nestLevel, opts);
        this.parameterTypes = src.parameters.slice(start, end).map((p) => visitor(p, nestLevel, opts));
        this.shouldEncodeReturnJson = this.returnType.isJsonEncodeRequired;
        this.shouldDecodeReturnJson = this.returnType.isJsonDecodeRequired;
        this.shouldEncodeParamsJson = this.parameterTypes.some((p) => p.isJsonEncodeRequired);
        this.shouldDecodeParamsJson = this.parameterTypes.some((p) => p.isJsonDecodeRequired);
        this.name = `${callType}<${this.parameterTypes.map((p) => p.name).join(', ')} => ${this.returnType.name}>`;
    }
    JIT_isType(): string {
        return ''; // functions are ignored when generating validation code
    }
    JIT_typeErrors(): string {
        return ''; // functions are ignored when generating validation cod
    }
    JIT_jsonEncode(): string {
        return ''; // functions are ignored when generating json encode code
    }
    JIT_jsonDecode(): string {
        return ''; // functions are ignored when generating json decode code
    }
    JIT_jsonStringify(): string {
        return ''; // functions are ignored when generating json stringify code
    }
    mock(): string {
        return ''; // functions are ignored when generating mock code
    }
    paramsIsTypeJIT(varName: string): string {
        return this.parameterTypes.map((p, i) => `(${p.JIT_isType(`${varName}[${i}]`)})`).join(' && ');
    }
    paramsTypeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return this.parameterTypes.map((p, i) => p.JIT_typeErrors(`${varName}[${i}]`, errorsName, pathChain)).join('');
    }
    paramsJsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeParamsJson) return varName;
        const paramsCode = this.parameterTypes.map((p, i) => p.JIT_jsonEncode(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsJsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeParamsJson) return varName;
        const paramsCode = this.parameterTypes.map((p, i) => p.JIT_jsonDecode(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsStringifyJIT(varName: string): string {
        const paramsCode = this.parameterTypes.map((p, i) => p.JIT_jsonStringify(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsMockJIT(varName: string): string {
        const arrayName = `paramList${this.nestLevel}`;
        const mockCodes = this.parameterTypes.map((rt, i) => `${rt.mock(`${arrayName}[${i}]`)};`).join('');
        return `const ${arrayName} = []; ${mockCodes} ${varName} = ${arrayName}[Math.floor(Math.random() * ${arrayName}.length)]`;
    }
    returnIsTypeJIT(varName: string): string {
        return this.returnType.JIT_isType(varName);
    }
    returnTypeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return this.returnType.JIT_typeErrors(varName, errorsName, pathChain);
    }
    returnJsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeReturnJson) return varName;
        return this.returnType.JIT_jsonEncode(varName);
    }
    returnStringifyJIT(varName: string): string {
        return this.returnType.JIT_jsonStringify(varName);
    }
    returnJsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeReturnJson) return varName;
        return this.returnType.JIT_jsonDecode(varName);
    }
    returnMockJIT(varName: string): string {
        return this.returnType.mock(varName);
    }
}
