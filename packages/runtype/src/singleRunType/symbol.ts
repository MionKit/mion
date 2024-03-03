/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeSymbol} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';

export class SymbolRunType implements RunType<TypeSymbol> {
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
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
    getJsonEncodeCode(): string {
        throw new Error('Symbol encode to json not supported.');
    }
    getJsonDecodeCode(): string {
        throw new Error('Symbol decode from json supported.');
    }
    getMockCode(varName: string): string {
        return (
            `const ALPHABET = 'abcdefghijklmnopqrstuvwxyz1234567890';` +
            `const index = Math.floor(Math.random() * ALPHABET.length);` +
            `${varName} = Symbol(ALPHABET[index])`
        );
    }
}
