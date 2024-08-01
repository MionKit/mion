/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeSymbol} from '../_deepkit/src/reflection/type';
import {JitErrorPath, JitJsonEncoder} from '../types';
import {toLiteral, pathChainToLiteral} from '../utils';
import {mockSymbol} from '../mock';
import {SingleRunType} from '../baseRunTypes';

export class SymbolRunType extends SingleRunType<TypeSymbol> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(varName: string): string {
        return `typeof ${varName} === 'symbol'`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return `if (typeof ${varName} !== 'symbol') ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(varName: string): string {
        return SymbolJitJsonENcoder.encodeToJson(varName);
    }
    compileJsonDecode(varName: string): string {
        return SymbolJitJsonENcoder.decodeFromJson(varName);
    }
    compileJsonStringify(varName: string): string {
        return SymbolJitJsonENcoder.stringify(varName);
    }
    mock(name?: string, length?: number, charsSet?: string): symbol {
        return mockSymbol(name, length, charsSet);
    }
}

export const SymbolJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `${varName} = Symbol(${varName}.substring(7))`;
    },
    encodeToJson(varName: string): string {
        return `${varName} =  'Symbol:' + (${varName}.description || '')`;
    },
    stringify(varName: string): string {
        return `JSON.stringify('Symbol:' + (${varName}.description || ''))`;
    },
};
