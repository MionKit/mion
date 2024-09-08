/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeSymbol} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockOptions, TypeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockSymbol} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `typeof ${ctx.args.value} === 'symbol'`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (typeof ${ctx.args.value} !== 'symbol') ${jitNames.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return SymbolJitJsonENcoder.encodeToJson(ctx.args.value);
    }
    compileJsonDecode(ctx: JitContext): string {
        return SymbolJitJsonENcoder.decodeFromJson(ctx.args.value);
    }
    compileJsonStringify(ctx: JitContext): string {
        return SymbolJitJsonENcoder.stringify(ctx.args.value);
    }
    mock(ctx?: Pick<MockOptions, 'symbolLength' | 'symbolCharSet' | 'symbolName'>): symbol {
        return mockSymbol(ctx?.symbolName, ctx?.symbolLength, ctx?.symbolCharSet);
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
