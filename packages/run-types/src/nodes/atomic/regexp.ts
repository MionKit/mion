/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeRegexp} from '@deepkit/type';
import type {JitCode} from '../../types.ts';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import {AtomicRunType} from '../../lib/baseRunTypes.ts';

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `(${comp.vλl} instanceof RegExp)`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (!(${comp.vλl} instanceof RegExp)) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl}.toString()`, type: 'E'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {
            code: `(function(){const parts = ${comp.vλl}.match(/\\/(.*)\\/(.*)?/) ;return new RegExp(parts[1], parts[2] || '')})()`,
            type: 'E',
        };
    }
}
