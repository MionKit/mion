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
        return comp.fnID !== JitFunctions.toJSCode.id;
    }
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'symbol'`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'symbol') ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return {code: `'Symbol:' + (${comp.vλl}.description || '')`, type: 'E'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {code: `Symbol(${comp.vλl}.substring(7))`, type: 'E'};
    }
}
