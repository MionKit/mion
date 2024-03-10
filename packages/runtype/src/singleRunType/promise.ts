import {TypePromise} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
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
        visitor: RunTypeVisitor,
        public readonly src: TypePromise,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        this.resolvedType = visitor(src.type, nestLevel, opts);
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
    jsonDecodeJIT(): string {
        throw new Error(`${this.name} can not be decoded from json.`);
    }
    jsonStringifyJIT(): string {
        throw new Error(`${this.name} can not be stringified.`);
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