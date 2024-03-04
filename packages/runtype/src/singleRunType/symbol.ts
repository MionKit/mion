/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeSymbol} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor, JitJsonEncoder} from '../types';

export class SymbolRunType implements RunType<TypeSymbol> {
    public readonly shouldEncodeJson = true;
    public readonly shouldDecodeJson = true;
    constructor(
        public readonly src: TypeSymbol,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `typeof ${varName} === 'symbol'`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, itemPath: string): string {
        return `if (typeof ${varName} !== 'symbol') ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a Symbol'})`;
    }
    getJsonEncodeCode(varName: string): string {
        return SymbolJitJsonENcoder.encodeToJson(varName);
    }
    getJsonDecodeCode(varName: string): string {
        return SymbolJitJsonENcoder.decodeFromJson(varName);
    }
    getMockCode(varName: string): string {
        return (
            `const ALPHABET = 'abcdefghijklmnopqrstuvwxyz1234567890';` +
            `const index = Math.floor(Math.random() * ALPHABET.length);` +
            `${varName} = Symbol(ALPHABET[index])`
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
};
