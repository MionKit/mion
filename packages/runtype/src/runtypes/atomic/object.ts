/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConstants} from '../../types';
import {random} from '../../lib/mock';
import {getExpected} from '../../lib/utils';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.object,
};

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(getExpected(this))}`;
    }

    _compileJsonStringify(comp: JitCompiler): string {
        return `JSON.stringify(${comp.vλl})`;
    }
    _mock(ctx: Pick<MockOperation, 'objectList'>): object {
        const objectList = ctx.objectList;
        return objectList[random(0, objectList.length - 1)];
    }
}
