/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBoolean} from '../../lib/_deepkit/src/reflection/type';
import type {JitConstants} from '../../types';
import {getExpected} from '../../lib/utils';
import {mockBoolean} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.boolean,
};
export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'boolean'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'boolean') ${comp.callJitErr(getExpected(this))}`;
    }
    _compileJsonStringify(comp: JitErrorsCompiler): string {
        return `(${comp.vλl} ? 'true' : 'false')`;
    }
    _mock(): boolean {
        return mockBoolean();
    }
}
