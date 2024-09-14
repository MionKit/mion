/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '../_deepkit/src/reflection/type';
import type {JitOperation, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockNumber} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.number,
};

export class NumberRunType extends AtomicRunType<TypeNumber> {
    src: TypeNumber = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'number';
    }
    _compileIsType(stack: JitOperation): string {
        const {vλl: value} = stack.args;
        return `Number.isFinite(${value})`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        const {εrrors: errors} = stack.args;
        return `if(!(${this._compileIsType(stack)})) ${errors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonDecode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonStringify(jc: JitOperation): string {
        return jc.args.vλl;
    }
    mock(stack?: Pick<MockContext, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(stack?.minNumber, stack?.maxNumber);
    }
}
