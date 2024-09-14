/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '../_deepkit/src/reflection/type';
import type {JitConstants, JitOperation, JitTypeErrorOperation} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.undefined,
};

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    src: TypeUndefined = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'undefined';
    }
    _compileIsType(stack: JitOperation): string {
        return `typeof ${stack.args.vλl} === 'undefined'`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (typeof ${stack.args.vλl} !== 'undefined') ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(stack: JitOperation): string {
        return `${stack.args.vλl} = null`;
    }
    _compileJsonDecode(stack: JitOperation): string {
        return `${stack.args.vλl} = undefined`;
    }
    _compileJsonStringify(): string {
        return `null`;
    }
    mock(): undefined {
        return undefined;
    }
}
