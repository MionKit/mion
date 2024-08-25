/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeSymbol} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, RunType} from '../types';
import {toLiteral} from '../utils';
import {mockSymbol} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class SymbolRunType extends SingleRunType<TypeSymbol> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(parents: RunType[], varName: string): string {
        return `typeof ${varName} === 'symbol'`;
    }
    compileTypeErrors(parents: RunType[], varName: string): string {
        return `if (typeof ${varName} !== 'symbol') ${jitNames.errors}.push({path: [...${jitNames.path}], expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return SymbolJitJsonENcoder.encodeToJson(varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return SymbolJitJsonENcoder.decodeFromJson(varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
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
