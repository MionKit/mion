/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeSymbol} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockSymbol} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.symbol,
};

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    src: TypeSymbol = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `typeof ${cop.vλl} === 'symbol'`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (typeof ${cop.vλl} !== 'symbol') utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)})`;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        return SymbolJitJsonEncoder.encodeToJson(cop.vλl);
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return SymbolJitJsonEncoder.decodeFromJson(cop.vλl);
    }
    _compileJsonStringify(cop: JitCompiler): string {
        return SymbolJitJsonEncoder.stringify(cop.vλl);
    }
    _mock(ctx: MockOperation): symbol {
        return mockSymbol(ctx.symbolName, ctx.symbolLength, ctx.symbolCharSet);
    }
}

export const SymbolJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `Symbol(${vλl}.substring(7))`;
    },
    encodeToJson(vλl: string): string {
        return `'Symbol:' + (${vλl}.description || '')`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify('Symbol:' + (${vλl}.description || ''))`;
    },
};
