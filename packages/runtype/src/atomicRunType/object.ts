/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../_deepkit/src/reflection/type';
import type {MockContext, JitConstants} from '../types';
import {random} from '../mock';
import {getJitErrorPath, getExpected} from '../utils';
import {mockObjectList} from '../constants';
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
    jitId: ReflectionKind.object,
};

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    src: TypeAny | TypeUnknown = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: jitIsTypeCompileOperation): string {
        return `(typeof ${cop.vλl} === 'object' && ${cop.vλl} !== null)`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOperation): string {
        return `if (!(${this._compileIsType(cop)})) ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
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
    mock(cop?: Pick<MockContext, 'objectList'>): object {
        const objectList = cop?.objectList || mockObjectList;
        return objectList[random(0, objectList.length - 1)];
    }
}
