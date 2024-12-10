/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeVoid} from '../../lib/_deepkit/src/reflection/type';
import type {JitConfig} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.void,
};

export class VoidRunType extends AtomicRunType<TypeVoid> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `${comp.vλl} === undefined`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (${comp.vλl} !== undefined) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler): string {
        return `${comp.vλl} = undefined`;
    }
    _compileFromJsonVal(comp: JitCompiler): string {
        return `${comp.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return 'undefined';
    }
    _mock(): void {}
}
