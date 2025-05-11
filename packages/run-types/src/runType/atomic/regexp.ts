/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    _getTypeID = () => ReflectionKind.regexp;
    _compileIsType(comp: JitCompiler): jitCode {
        return `(${comp.vλl} instanceof RegExp)`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (!(${comp.vλl} instanceof RegExp)) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return regexpTransformer._compileToJsonVal(comp);
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return regexpTransformer._compileFromJsonVal(comp);
    }
}

// regexpTransformer (used internally only so no need to register in JitUtils)
export const regexpTransformer = {
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return `(function(){const parts = ${comp.vλl}.match(/\\/(.*)\\/(.*)?/) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return `${comp.vλl}.toString()`;
    },
};
