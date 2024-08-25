import type {TypePromise} from '../_deepkit/src/reflection/type';
import type {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {SingleRunType} from '../baseRunTypes';
import {getErrorPath, getExpected} from '../utils';
import {jitNames} from '../constants';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class PromiseRunType extends SingleRunType<TypePromise> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    public readonly resolvedType: RunType;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypePromise,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.resolvedType = visitor(src.type, [...parents, this], opts);
    }
    compileIsType(parents: RunType[], varName: string): string {
        return `${varName} instanceof Promise`;
    }
    resolvedIsTypeJIT(parents: RunType[], varName: string): string {
        return this.resolvedType.compileIsType(parents, varName);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if (!(${varName} instanceof Promise)) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    resolveTypeErrorsJIT(parents: RunType[], varName: string, pathC: string[]): string {
        return this.resolvedType.compileTypeErrors(parents, varName, pathC);
    }
    compileJsonEncode(): string {
        throw new Error(`${this.getName()} can not be encoded to json.`);
    }
    compileJsonDecode(): string {
        throw new Error(`${this.getName()} can not be decoded from json.`);
    }
    compileJsonStringify(): string {
        throw new Error(`${this.getName()} can not be stringified.`);
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
