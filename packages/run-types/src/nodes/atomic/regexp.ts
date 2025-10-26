/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    _getTypeID = () => ReflectionKind.regexp;
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `(${comp.vλl} instanceof RegExp)`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (!(${comp.vλl} instanceof RegExp)) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return regexpTransformer.visitPrepareForJson(comp);
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return regexpTransformer.visitRestoreFromJson(comp);
    }
}

// regexpTransformer (used internally only so no need to register in JitUtils)
export const regexpTransformer = {
    visitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {
            code: `(function(){const parts = ${comp.vλl}.match(/\\/(.*)\\/(.*)?/) ;return new RegExp(parts[1], parts[2] || '')})()`,
            type: 'E',
        };
    },
    visitPrepareForJson(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl}.toString()`, type: 'E'};
    },
};
