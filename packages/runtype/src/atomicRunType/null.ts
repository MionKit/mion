/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNull} from '../_deepkit/src/reflection/type';
import type {JitConstants} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.null,
};

export class NullRunType extends AtomicRunType<TypeNull> {
    src: TypeNull = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `${comp.vλl} === null`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (${comp.vλl} !== null) utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)})`;
    }
    _mock(): null {
        return null;
    }
}
