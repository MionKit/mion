/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeSymbol} from '@deepkit/type';
import {RunType, RunTypeVisitor, JitJsonEncoder} from '../types';
import {toLiteral} from '../utils';

export class SymbolRunType implements RunType<TypeSymbol> {
    public readonly name = 'symbol';
    public readonly shouldEncodeJson = true;
    public readonly shouldDecodeJson = true;
    constructor(
        public readonly src: TypeSymbol,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
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
        return SymbolJitJsonENcoder.encodeToJson(varName);
    }
    jsonDecodeJIT(varName: string): string {
        return SymbolJitJsonENcoder.stringify(varName);
    }
    mockJIT(varName: string): string {
        const alpha = `alpha${this.nestLevel}`;
        return (
            `const ${alpha} = 'abcdefghijklmnopqrstuvwxyz1234567890';` +
            `${varName} = Symbol(${alpha}[Math.floor(Math.random() * ${alpha}.length)])`
        );
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
