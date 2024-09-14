/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNull} from '../_deepkit/src/reflection/type';
import type {JitConstants, JitOperation, JitTypeErrorOperation} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.null,
};

export class NullRunType extends AtomicRunType<TypeNull> {
    src: TypeNull = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'null';
    }
    _compileIsType(stack: JitOperation): string {
        return `${stack.args.vλl} === null`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (${stack.args.vλl} !== null) ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonDecode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonStringify(stack: JitOperation): string {
        return stack.args.vλl;
    }
    mock(): null {
        return null;
    }
}
