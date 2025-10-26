/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeSymbol} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '../../constants.functions';

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    _getTypeID = () => ReflectionKind.symbol;
    skipJit(comp: JitFnCompiler): boolean {
        if (!comp) return true;
        return comp.fnID !== JitFunctions.toJavascript.id;
    }
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'symbol'`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'symbol') ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return symbolTransformer.visitPrepareForJson(comp);
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return symbolTransformer.visitRestoreFromJson(comp);
    }
}

// symbolTransformer (used internally only so no need to register in JitUtils)

export const symbolTransformer = {
    // TODO: transformers might need only one function
    visitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {code: `Symbol(${comp.vλl}.substring(7))`, type: 'E'};
    },
    visitPrepareForJson(comp: JitFnCompiler): JitCode {
        return {code: `'Symbol:' + (${comp.vλl}.description || '')`, type: 'E'};
    },
};
