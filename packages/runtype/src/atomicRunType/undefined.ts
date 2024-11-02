/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '../_deepkit/src/reflection/type';
import type {JitConstants} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';
import type {JitCompiler, JitTypeErrorCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.undefined,
};

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    src: TypeUndefined = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `typeof ${cop.vλl} === 'undefined'`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompiler): string {
        return `if (typeof ${cop.vλl} !== 'undefined') ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        return `${cop.vλl} = null`;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return `${cop.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return `null`;
    }
    mock(): undefined {
        return undefined;
    }
}
