/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '../_deepkit/src/reflection/type';
import type {JitOperation, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected, toLiteral} from '../utils';
import {random} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.enum,
};

export class EnumRunType extends AtomicRunType<TypeEnum> {
    src: TypeEnum = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'enum';
    }
    _compileIsType(stack: JitOperation): string {
        return this.src.values.map((v) => `${stack.args.vλl} === ${toLiteral(v)}`).join(' || ');
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (!(${this._compileIsType(stack)})) ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonDecode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonStringify(stack: JitOperation): string {
        if (this.src.indexType.kind === ReflectionKind.number) return stack.args.vλl;
        return `JSON.stringify(${stack.args.vλl})`;
    }
    mock(stack?: Pick<MockContext, 'enumIndex'>): string | number | undefined | null {
        const i = stack?.enumIndex || random(0, this.src.values.length - 1);
        return this.src.values[i];
    }
}
