import {TypePromise} from '../_deepkit/src/reflection/type';
import {SingleRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class PromiseRunType extends SingleRunType<TypePromise> {
    public readonly slug: string;
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    public readonly resolvedType: RunType;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypePromise,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.resolvedType = visitor(src.type, [...parents, this], opts);
        this.slug = `promise<${this.resolvedType.slug}>`;
    }
    compileIsType(varName: string): string {
        return `${varName} instanceof Promise`;
    }
    resolvedIsTypeJIT(varName: string): string {
        return this.resolvedType.compileIsType(varName);
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${varName} instanceof Promise)) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    resolveTypeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return this.resolvedType.compileTypeErrors(varName, errorsName, pathChain);
    }
    compileJsonEncode(): string {
        throw new Error(`${this.slug} can not be encoded to json.`);
    }
    compileJsonDecode(): string {
        throw new Error(`${this.slug} can not be decoded from json.`);
    }
    compileJsonStringify(): string {
        throw new Error(`${this.slug} can not be stringified.`);
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
