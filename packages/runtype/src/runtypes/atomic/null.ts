/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNull} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitConfig} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.null,
};

export class NullRunType extends AtomicRunType<TypeNull> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `${comp.vλl} === null`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (${comp.vλl} !== null) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal() {
        return undefined;
    }
    _compileFromJsonVal() {
        return undefined;
    }
    _compileJsonStringify(comp: JitCompiler) {
        return comp.vλl;
    }
    _mock(): null {
        return null;
    }
}
