/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '../_deepkit/src/reflection/type';
import type {MockContext, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockNumber} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
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
    jitId: ReflectionKind.number,
};

export class NumberRunType extends AtomicRunType<TypeNumber> {
    src: TypeNumber = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: jitIsTypeCompileOperation): string {
        return `Number.isFinite(${cop.vλl})`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOperation): string {
        return `if(!(${this._compileIsType(cop)})) ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
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
    mock(cop?: Pick<MockContext, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(cop?.minNumber, cop?.maxNumber);
    }
}
