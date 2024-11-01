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
import type {
    jitIsTypeCompileOperation,
    JitJsonDecodeCompileOperation,
    JitJsonEncodeCompileOperation,
    JitJsonStringifyCompileOperation,
    JitTypeErrorCompileOperation,
} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.null,
};

export class NullRunType extends AtomicRunType<TypeNull> {
    src: TypeNull = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: jitIsTypeCompileOperation): string {
        return `${cop.vλl} === null`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOperation): string {
        return `if (${cop.vλl} !== null) ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitJsonEncodeCompileOperation): string {
        return cop.vλl;
    }
    _compileJsonDecode(cop: JitJsonDecodeCompileOperation): string {
        return cop.vλl;
    }
    _compileJsonStringify(cop: JitJsonStringifyCompileOperation): string {
        return cop.vλl;
    }
    mock(): null {
        return null;
    }
}
