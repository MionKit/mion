/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBoolean} from '../_deepkit/src/reflection/type';
import type {JitConstants, JitOperation, JitTypeErrorOperation} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockBoolean} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.boolean,
};
export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    src: TypeBoolean = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'boolean';
    }
    _compileIsType(stack: JitOperation): string {
        return `typeof ${stack.args.vλl} === 'boolean'`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (typeof ${stack.args.vλl} !== 'boolean') ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
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
    mock(): boolean {
        return mockBoolean();
    }
}
