/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../_deepkit/src/reflection/type';
import type {JitConstants, MockContext} from '../types';
import {mockAny} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import type {
    JitJsonDecodeCompileOperation,
    JitJsonEncodeCompileOperation,
    JitJsonStringifyCompileOperation,
} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.any,
};

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    src: TypeAny | TypeUnknown = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(): 'true' {
        return 'true';
    }
    _compileTypeErrors(): '' {
        return '';
    }
    _compileJsonEncode(cop: JitJsonEncodeCompileOperation): string {
        return cop.vλl;
    }
    _compileJsonDecode(cop: JitJsonDecodeCompileOperation): string {
        return cop.vλl;
    }
    _compileJsonStringify(cop: JitJsonStringifyCompileOperation): string {
        return `JSON.stringify(${cop.vλl})`;
    }
    mock(ctx?: Pick<MockContext, 'anyValuesLis'>): string {
        return mockAny(ctx?.anyValuesLis);
    }
}
