/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeVoid} from '../_deepkit/src/reflection/type';
import type {JitConstants} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.void,
};

export class VoidRunType extends AtomicRunType<TypeVoid> {
    src: TypeVoid = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `${cop.vλl} === undefined`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (${cop.vλl} !== undefined) µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)})`;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        return `${cop.vλl} = undefined`;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return `${cop.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return 'undefined';
    }
    _mock(): void {}
}
