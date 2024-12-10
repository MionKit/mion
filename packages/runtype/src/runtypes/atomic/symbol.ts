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
import {symbolSerializer} from '../../serializers/symbol';

const jitConstants: JitConfig = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
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
    _compileJsonEncode(comp: JitCompiler) {
        return symbolSerializer.toJsonVal(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler) {
        return symbolSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return symbolSerializer.stringify(comp.vλl);
    }
    _mock(ctx: MockOperation): symbol {
        return mockSymbol(ctx.symbolName, ctx.symbolLength, ctx.symbolCharSet);
    }
}
