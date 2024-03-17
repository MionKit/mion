/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeSymbol} from '../_deepkit/src/reflection/type';
import {JitJsonEncoder} from '../types';
import {toLiteral} from '../utils';
import {mockSymbol} from '../mock';
import {BaseRunType} from '../baseRunType';

export class SymbolRunType extends BaseRunType<TypeSymbol> {
    public readonly name = 'symbol';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    JIT_isType(varName: string): string {
        return `typeof ${varName} === 'symbol'`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'symbol') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return SymbolJitJsonENcoder.encodeToJson(varName);
    }
    JIT_jsonDecode(varName: string): string {
        return SymbolJitJsonENcoder.decodeFromJson(varName);
    }
    JIT_jsonStringify(varName: string): string {
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
