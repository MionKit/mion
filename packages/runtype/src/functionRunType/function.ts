/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeCallSignature, TypeFunction, TypeMethodSignature} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class FunctionRunType<T extends TypeMethodSignature | TypeCallSignature | TypeFunction> implements RunType<T> {
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
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
        this.shouldEncodeReturnJson = this.returnType.shouldEncodeJson;
        this.shouldDecodeReturnJson = this.returnType.shouldDecodeJson;
        this.shouldEncodeParamsJson = this.parameterTypes.some((p) => p.shouldEncodeJson);
        this.shouldDecodeParamsJson = this.parameterTypes.some((p) => p.shouldDecodeJson);
        this.name = `${callType}<${this.parameterTypes.map((p) => p.name).join(', ')} => ${this.returnType.name}>`;
    }
    getValidateCode(): string {
        return ''; // functions are ignored when generating validation code
    }
    getValidateCodeWithErrors(): string {
        return ''; // functions are ignored when generating validation cod
    }
    getJsonEncodeCode(): string {
        return ''; // functions are ignored when generating json encode code
    }
    getJsonDecodeCode(): string {
        return ''; // functions are ignored when generating json decode code
    }
    getMockCode(): string {
        return ''; // functions are ignored when generating mock code
    }
    paramsGetValidateCode(varName: string): string {
        return this.parameterTypes.map((p, i) => `(${p.getValidateCode(`${varName}[${i}]`)})`).join(' && ');
    }
    paramsGetValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return this.parameterTypes.map((p, i) => p.getValidateCodeWithErrors(`${varName}[${i}]`, errorsName, pathChain)).join('');
    }
    paramsGetJsonEncodeCode(varName: string): string {
        if (!this.shouldEncodeParamsJson) return '[]';
        const paramsCode = this.parameterTypes.map((p, i) => p.getJsonEncodeCode(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsGetJsonDecodeCode(varName: string): string {
        if (!this.shouldDecodeParamsJson) return '[]';
        const paramsCode = this.parameterTypes.map((p, i) => p.getJsonDecodeCode(`${varName}[${i}]`)).join(', ');
        return `[${paramsCode}]`;
    }
    paramsGetMockCode(varName: string): string {
        const arrayName = `paramList${this.nestLevel}`;
        const mockCodes = this.parameterTypes.map((rt, i) => `${rt.getMockCode(`${arrayName}[${i}]`)};`).join('');
        return `const ${arrayName} = []; ${mockCodes} ${varName} = ${arrayName}[Math.floor(Math.random() * ${arrayName}.length)]`;
    }
    returnGetValidateCode(varName: string): string {
        return this.returnType.getValidateCode(varName);
    }
    returnGetValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return this.returnType.getValidateCodeWithErrors(varName, errorsName, pathChain);
    }
    returnGetJsonEncodeCode(varName: string): string {
        if (!this.shouldEncodeReturnJson) return varName;
        return this.returnType.getJsonEncodeCode(varName);
    }
    returnGetJsonDecodeCode(varName: string): string {
        if (!this.shouldDecodeReturnJson) return varName;
        return this.returnType.getJsonDecodeCode(varName);
    }
    returnGetMockCode(varName: string): string {
        return this.returnType.getMockCode(varName);
    }
}
