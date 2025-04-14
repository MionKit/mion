/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '@deepkit/type';
import type {JitConfig, jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.string,
};

export class StringRunType extends AtomicRunType<TypeString> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): jitCode {
        return `typeof ${comp.vλl} === 'string'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (typeof ${comp.vλl} !== 'string') ${comp.callJitErr(this)}`;
    }
}
