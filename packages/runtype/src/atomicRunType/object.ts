/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../_deepkit/src/reflection/type';
import type {JitOperation, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {random} from '../mock';
import {getJitErrorPath, getExpected} from '../utils';
import {mockObjectList} from '../constants';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.object,
};

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    src: TypeAny | TypeUnknown = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'object';
    }
    _compileIsType(stack: JitOperation): string {
        return `(typeof ${stack.args.vλl} === 'object' && ${stack.args.vλl} !== null)`;
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
        return `JSON.stringify(${stack.args.vλl})`;
    }
    mock(stack?: Pick<MockContext, 'objectList'>): object {
        const objectList = stack?.objectList || mockObjectList;
        return objectList[random(0, objectList.length - 1)];
    }
}
