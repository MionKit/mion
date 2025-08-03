/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeVoid} from '@deepkit/type';
import type {jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {JitFunctions} from '../../constants.functions';

export class VoidRunType extends AtomicRunType<TypeVoid> {
    _getTypeID = () => ReflectionKind.void;
    _compileIsType(comp: JitCompiler): jitCode {
        return {
            code: `${comp.vλl} === undefined`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {
            code: `if (${comp.vλl} !== undefined) ${comp.callJitErr(this)}`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `${comp.vλl} = undefined`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `${comp.vλl} = undefined`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        return undefined;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        return undefined;
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        return undefined;
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        return undefined;
    }
}
