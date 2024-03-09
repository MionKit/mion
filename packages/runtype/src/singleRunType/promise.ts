import {TypePromise} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class PromiseRunType implements RunType<TypePromise> {
    public readonly name: string;
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    public readonly resolvedType: RunType;
    constructor(
        public readonly src: TypePromise,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.resolvedType = visitor(src.type, nestLevel);
        this.name = `promise<${this.resolvedType.name}>`;
    }
    isTypeJIT(varName: string): string {
        return `${varName} instanceof Promise`;
    }
    resolvedIsTypeJIT(varName: string): string {
        return this.resolvedType.isTypeJIT(varName);
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${varName} instanceof Promise)) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    resolveTypeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return this.resolvedType.typeErrorsJIT(varName, errorsName, pathChain);
    }
    jsonEncodeJIT(): string {
        throw new Error(`${this.name} can not be encoded to json.`);
    }
    jsonStringifyJIT(): string {
        throw new Error(`${this.name} can not be stringified.`);
    }
    jsonDecodeJIT(): string {
        throw new Error(`${this.name} can not be decoded from json.`);
    }
    mock(timeOut = 1, rejectError: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (timeOut > 0) {
                setTimeout(() => {
                    if (rejectError) reject(new Error(rejectError));
                    else resolve(this.resolvedType.mock());
                }, timeOut);
                return;
            }
            if (rejectError) reject(new Error(rejectError));
            else resolve(this.resolvedType.mock());
        });
    }
}
