/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeSymbol} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockSymbol} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {symbolTransformer} from '../../transformers/symbol';

const jitConstants: JitConfig = {
    skipJit: true,
    jitId: ReflectionKind.symbol,
};

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'symbol'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'symbol') ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return symbolTransformer._compileToJsonVal(comp, this);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return symbolTransformer._compileFromJsonVal(comp, this);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return symbolTransformer._compileJsonStringify(comp, this);
    }
    _mock(ctx: MockOperation): symbol {
        return mockSymbol(ctx.symbolName, ctx.symbolLength, ctx.symbolCharSet);
    }
}
