/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeSymbol} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockContext, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockSymbol} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `typeof ${ctx.args.vλl} === 'symbol'`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (typeof ${ctx.args.vλl} !== 'symbol') ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return SymbolJitJsonEncoder.encodeToJson(ctx.args.vλl);
    }
    compileJsonDecode(ctx: JitContext): string {
        return SymbolJitJsonEncoder.decodeFromJson(ctx.args.vλl);
    }
    compileJsonStringify(ctx: JitContext): string {
        return SymbolJitJsonEncoder.stringify(ctx.args.vλl);
    }
    mock(ctx?: Pick<MockContext, 'symbolLength' | 'symbolCharSet' | 'symbolName'>): symbol {
        return mockSymbol(ctx?.symbolName, ctx?.symbolLength, ctx?.symbolCharSet);
    }
}

export const SymbolJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = Symbol(${vλl}.substring(7))`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl} =  'Symbol:' + (${vλl}.description || '')`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify('Symbol:' + (${vλl}.description || ''))`;
    },
};
