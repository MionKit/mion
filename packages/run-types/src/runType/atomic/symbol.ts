/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeSymbol} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '@mionkit/run-types/src/constants';

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    getTypeID = () => ReflectionKind.symbol;
    skipJit(comp: JitCompiler): boolean {
        if (!comp) return true;
        return comp.fnId !== JitFunctions.toCode.id;
    }
    _compileIsType(comp: JitCompiler): jitCode {
        return `typeof ${comp.vλl} === 'symbol'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (typeof ${comp.vλl} !== 'symbol') ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return symbolTransformer._compileToJsonVal(comp);
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return symbolTransformer._compileFromJsonVal(comp);
    }
}

// symbolTransformer (used internally only so no need to register in JitUtils)

export const symbolTransformer = {
    // TODO: transformers might need only one function
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return `Symbol(${comp.vλl}.substring(7))`;
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return `'Symbol:' + (${comp.vλl}.description || '')`;
    },
};
