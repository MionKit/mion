/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeVoid} from '../_deepkit/src/reflection/type';
import type {JitConstants} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.void,
};

export class VoidRunType extends AtomicRunType<TypeVoid> {
    src: TypeVoid = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    getName(): string {
        return 'void';
    }
    _compileIsType(cop: JitCompileOp): string {
        return `${cop.vλl} === undefined`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `if (${cop.vλl} !== undefined) ${cop.args.εrrors}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return `${cop.vλl} = undefined`;
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return `${cop.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return 'undefined';
    }
    mock(): void {}
}
