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
import {JitFunctions} from '../../constants.functions';

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    _getTypeID = () => ReflectionKind.symbol;
    // SymbolRunType handles skipJit logic for certain operations
    _compileIsType(comp: JitCompiler): jitCode {
        return {
            code: `typeof ${comp.vλl} === 'symbol'`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {
            code: `if (typeof ${comp.vλl} !== 'symbol') ${comp.callJitErr(this)}`,
            codeType: 'S',
            skipJit: false
        };
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
        return {
            code: `Symbol(${comp.vλl}.substring(7))`,
            codeType: 'S',
            skipJit: false
        };
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `'Symbol:' + (${comp.vλl}.description || '')`,
            codeType: 'S',
            skipJit: false
        };
    },
};
