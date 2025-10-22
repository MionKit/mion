/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    _getTypeID = () => ReflectionKind.regexp;
    emitIsType(comp: JitCompiler): JitCode {
        return {code: `(${comp.vλl} instanceof RegExp)`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (!(${comp.vλl} instanceof RegExp)) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitToJsonVal(comp: JitCompiler): JitCode {
        return regexpTransformer.visitToJsonVal(comp);
    }
    emitFromJsonVal(comp: JitCompiler): JitCode {
        return regexpTransformer.visitFromJsonVal(comp);
    }
}

// regexpTransformer (used internally only so no need to register in JitUtils)
export const regexpTransformer = {
    visitFromJsonVal(comp: JitCompiler): JitCode {
        return {
            code: `(function(){const parts = ${comp.vλl}.match(/\\/(.*)\\/(.*)?/) ;return new RegExp(parts[1], parts[2] || '')})()`,
            type: 'E',
        };
    },
    visitToJsonVal(comp: JitCompiler): JitCode {
        return {code: `${comp.vλl}.toString()`, type: 'E'};
    },
};
