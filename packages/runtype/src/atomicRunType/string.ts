/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '../_deepkit/src/reflection/type';
import type {JitOperation, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockString, random} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames, stringCharSet} from '../constants';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.string,
};

export class StringRunType extends AtomicRunType<TypeString> {
    src: TypeString = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'string';
    }
    _compileIsType(op: JitOperation): string {
        return `typeof ${op.args.vλl} === 'string'`;
    }
    _compileTypeErrors(op: JitTypeErrorOperation): string {
        return `if (typeof ${op.args.vλl} !== 'string') ${op.args.εrrors}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonDecode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonStringify(stack: JitOperation): string {
        return `${jitNames.utils}.asJSONString(${stack.args.vλl})`;
    }
    mock(stack?: Pick<MockContext, 'stringLength' | 'stringCharSet'>): string {
        const length = stack?.stringLength || random(1, 500);
        const charSet = stack?.stringCharSet || stringCharSet;
        return mockString(length, charSet);
    }
}
