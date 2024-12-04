/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '../../lib/_deepkit/src/reflection/type';
import type {JitConfig} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConfig = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.undefined,
};

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'undefined'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        return `${comp.vλl} = null`;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        return `${comp.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return `null`;
    }
    _mock(): undefined {
        return undefined;
    }
}
