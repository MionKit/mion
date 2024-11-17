/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../_deepkit/src/reflection/type';
import type {MockOperation, JitConstants} from '../types';
import {random} from '../mock';
import {getJitErrorPath, getExpected} from '../utils';
import {AtomicRunType} from '../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.object,
};

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    src: TypeAny | TypeUnknown = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `(typeof ${cop.vλl} === 'object' && ${cop.vλl} !== null)`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (!(${this._compileIsType(cop)})) µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)})`;
    }

    _compileJsonStringify(cop: JitCompiler): string {
        return `JSON.stringify(${cop.vλl})`;
    }
    _mock(ctx: Pick<MockOperation, 'objectList'>): object {
        const objectList = ctx.objectList;
        return objectList[random(0, objectList.length - 1)];
    }
}
