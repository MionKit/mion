/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeCallSignature, TypeFunction, TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor} from '../types';

export class FunctionRunType<T extends TypeMethodSignature | TypeCallSignature | TypeFunction> implements RunType<T> {
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
        public readonly src: T,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number,
        callType = 'function'
    ) {
        this.returnType = visitor(src.return, nestLevel);
        this.parameterTypes = src.parameters.map((p) => visitor(p, nestLevel));
        this.shouldEncodeReturnJson = this.returnType.isJsonEncodeRequired;
        this.shouldDecodeReturnJson = this.returnType.isJsonDecodeRequired;
        this.shouldEncodeParamsJson = this.parameterTypes.some((p) => p.isJsonEncodeRequired);
        this.shouldDecodeParamsJson = this.parameterTypes.some((p) => p.isJsonDecodeRequired);
        this.name = `${callType}<${this.parameterTypes.map((p) => p.name).join(', ')} => ${this.returnType.name}>`;
    }
    isTypeJIT(): string {
        return ''; // functions are ignored when generating validation code
    }
    typeErrorsJIT(): string {
        return ''; // functions are ignored when generating validation cod
    }
    jsonEncodeJIT(): string {
        return ''; // functions are ignored when generating json encode code
    }
    jsonStringifyJIT(): string {
        return ''; // functions are ignored when generating json stringify code
    }
    jsonDecodeJIT(): string {
        return ''; // functions are ignored when generating json decode code
    }
    mock(): string {
        return ''; // functions are ignored when generating mock code
    }
    paramsIsTypeJIT(varName: string): string {
        return this.parameterTypes.map((p, i) => `(${p.isTypeJIT(`${varName}[${i}]`)})`).join(' && ');
    }
    paramsTypeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return this.parameterTypes.map((p, i) => p.typeErrorsJIT(`${varName}[${i}]`, errorsName, pathChain)).join('');
    }
    paramsJsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeParamsJson) return varName;
        const paramsCode = this.parameterTypes.map((p, i) => p.jsonEncodeJIT(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsStringifyJIT(varName: string): string {
        const paramsCode = this.parameterTypes.map((p, i) => p.jsonStringifyJIT(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsJsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeParamsJson) return varName;
        const paramsCode = this.parameterTypes.map((p, i) => p.jsonDecodeJIT(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsMockJIT(varName: string): string {
        const arrayName = `paramList${this.nestLevel}`;
        const mockCodes = this.parameterTypes.map((rt, i) => `${rt.mock(`${arrayName}[${i}]`)};`).join('');
        return `const ${arrayName} = []; ${mockCodes} ${varName} = ${arrayName}[Math.floor(Math.random() * ${arrayName}.length)]`;
    }
    returnIsTypeJIT(varName: string): string {
        return this.returnType.isTypeJIT(varName);
    }
    returnTypeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return this.returnType.typeErrorsJIT(varName, errorsName, pathChain);
    }
    returnJsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeReturnJson) return varName;
        return this.returnType.jsonEncodeJIT(varName);
    }
    returnStringifyJIT(varName: string): string {
        return this.returnType.jsonStringifyJIT(varName);
    }
    returnJsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeReturnJson) return varName;
        return this.returnType.jsonDecodeJIT(varName);
    }
    returnMockJIT(varName: string): string {
        return this.returnType.mock(varName);
    }
}
