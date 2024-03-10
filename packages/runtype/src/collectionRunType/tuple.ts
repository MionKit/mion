/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, toLiteral} from '../utils';

export class TupleRunType implements RunType<TypeTuple> {
    public readonly name: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly runTypes: RunType[];
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTuple,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        this.runTypes = src.types.map((t) => visitor(t, nestLevel, opts));
        this.name = `tuple<${this.runTypes.map((rt) => rt.name).join(', ')}>`;
        this.isJsonEncodeRequired = this.runTypes.some((rt) => rt.isJsonEncodeRequired);
        this.isJsonDecodeRequired = this.runTypes.some((rt) => rt.isJsonDecodeRequired);
    }
    isTypeJIT(varName: string): string {
        return this.runTypes.map((rt, i) => `(${rt.isTypeJIT(`${varName}[${i}]`)})`).join(' && ');
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        const itemsCode = this.runTypes
            .map((rt, i) => rt.typeErrorsJIT(`${varName}[${i}]`, errorsName, addToPathChain(pathChain, i)))
            .join(';');
        return (
            `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}});` +
            `else {${itemsCode}}`
        );
    }
    jsonEncodeJIT(varName: string): string {
        if (!this.isJsonEncodeRequired) return varName;
        const encodeCodes = this.runTypes.map((rt, i) => {
            const useNative = !this.opts?.strictJSON && !rt.isJsonEncodeRequired;
            return useNative ? `${varName}[${i}]` : rt.jsonEncodeJIT(`${varName}[${i}]`);
        });
        return `[${encodeCodes.join(',')}]`;
    }
    jsonStringifyJIT(varName: string): string {
        const encodeCodes = this.runTypes.map((rt, i) => rt.jsonStringifyJIT(`${varName}[${i}]`));
        return `'['+${encodeCodes.join(`+','+`)}+']'`;
    }
    jsonDecodeJIT(varName: string): string {
        const decodeCodes = this.runTypes.map((rt, i) => {
            const useNative = !this.opts?.strictJSON && !rt.isJsonDecodeRequired;
            return useNative ? `${varName}[${i}]` : rt.jsonDecodeJIT(`${varName}[${i}]`);
        });
        return `[${decodeCodes.join(',')}]`;
    }
    mock(...tupleArgs: any[][]): any[] {
        return this.runTypes.map((rt, i) => rt.mock(...(tupleArgs?.[i] || [])));
    }
}
