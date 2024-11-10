/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBoolean} from '../_deepkit/src/reflection/type';
import type {JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockBoolean} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.boolean,
};
export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    src: TypeBoolean = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `typeof ${cop.vλl} === 'boolean'`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (typeof ${cop.vλl} !== 'boolean') µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)})`;
    }
    _compileJsonStringify(cop: JitErrorsCompiler): string {
        return `(${cop.vλl} ? 'true' : 'false')`;
    }
    mock(): boolean {
        return mockBoolean();
    }
}
