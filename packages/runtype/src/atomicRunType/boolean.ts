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
import {JitDefaultOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.boolean,
};
export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    src: TypeBoolean = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitDefaultOp): string {
        return `typeof ${cop.vλl} === 'boolean'`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `if (typeof ${cop.vλl} !== 'boolean') ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitDefaultOp): string {
        return cop.vλl;
    }
    _compileJsonDecode(cop: JitDefaultOp): string {
        return cop.vλl;
    }
    _compileJsonStringify(cop: JitDefaultOp): string {
        return cop.vλl;
    }
    mock(): boolean {
        return mockBoolean();
    }
}
