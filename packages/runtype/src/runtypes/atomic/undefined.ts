/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitConfig} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.undefined,
};

// TODO: json stringify removes undefined values, so we might wat to do the same here

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'undefined'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return `${comp.vλl} = null`;
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return `${comp.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return `null`;
    }
    _mock(): undefined {
        return undefined;
    }
}
