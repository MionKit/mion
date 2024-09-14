/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeVoid} from '../_deepkit/src/reflection/type';
import type {JitConstants, JitOperation, JitTypeErrorOperation} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';

const jitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.void,
};

export class VoidRunType extends AtomicRunType<TypeVoid> {
    src: TypeVoid = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'void';
    }
    _compileIsType(stack: JitOperation): string {
        return `${stack.args.vλl} === undefined`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (${stack.args.vλl} !== undefined) ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(stack: JitOperation): string {
        return `${stack.args.vλl} = undefined`;
    }
    _compileJsonDecode(stack: JitOperation): string {
        return `${stack.args.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return 'undefined';
    }
    mock(): void {}
}
