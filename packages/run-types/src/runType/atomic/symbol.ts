/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeSymbol} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '../../constants.functions';

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    _getTypeID = () => ReflectionKind.symbol;
    skipJit(comp: JitCompiler): boolean {
        if (!comp) return true;
        return comp.fnID !== JitFunctions.toJavascript.id;
    }
    _compileIsType(comp: JitCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'symbol'`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'symbol') ${comp.callJitErr(this)}`, type: 'S'};
    }
    _compileToJsonVal(comp: JitCompiler): JitCode {
        return symbolTransformer._compileToJsonVal(comp);
    }
    _compileFromJsonVal(comp: JitCompiler): JitCode {
        return symbolTransformer._compileFromJsonVal(comp);
    }
}

// symbolTransformer (used internally only so no need to register in JitUtils)

export const symbolTransformer = {
    // TODO: transformers might need only one function
    _compileFromJsonVal(comp: JitCompiler): JitCode {
        return {code: `Symbol(${comp.vλl}.substring(7))`, type: 'E'};
    },
    _compileToJsonVal(comp: JitCompiler): JitCode {
        return {code: `'Symbol:' + (${comp.vλl}.description || '')`, type: 'E'};
    },
};
