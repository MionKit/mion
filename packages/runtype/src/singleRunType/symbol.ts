/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeSymbol} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor, JitJsonEncoder, RunTypeOptions} from '../types';
import {toLiteral} from '../utils';
import {mockSymbol} from '../mock';

export class SymbolRunType implements RunType<TypeSymbol> {
    public readonly name = 'symbol';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeSymbol,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'symbol'`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'symbol') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return SymbolJitJsonENcoder.encodeToJson(varName);
    }
    jsonStringifyJIT(varName: string): string {
        return SymbolJitJsonENcoder.stringify(varName);
    }
    jsonDecodeJIT(varName: string): string {
        return SymbolJitJsonENcoder.decodeFromJson(varName);
    }
    mock(name?: string, length?: number, charsSet?: string): symbol {
        return mockSymbol(name, length, charsSet);
    }
}

export const SymbolJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `Symbol(${varName}.substring(7))`;
    },
    encodeToJson(varName: string): string {
        return `'Symbol:' + (${varName}.description || '')`;
    },
    stringify(varName: string): string {
        return `JSON.stringify('Symbol:' + (${varName}.description || ''))`;
    },
};
