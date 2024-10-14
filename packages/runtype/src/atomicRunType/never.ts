/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNever} from '../_deepkit/src/reflection/type';
import {AtomicRunType} from '../baseRunTypes';
import {JitTypeErrorCompileOp} from '../jitOperation';
import {JitConstants} from '../types';
import {getExpected, getJitErrorPath} from '../utils';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    isCircularRef: false,
    jitId: ReflectionKind.never,
};
export class NeverRunType extends AtomicRunType<TypeNever> {
    src: TypeNever = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    getName(): string {
        return 'never';
    }
    _compileIsType(): string {
        return 'false';
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `${cop.args.εrrors}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(): string {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    _compileJsonDecode(): string {
        throw new Error('Never type cannot be decoded from JSON.');
    }
    _compileJsonStringify(): string {
        throw new Error('Never type cannot be stringified.');
    }
    mock() {
        throw new Error('Never type cannot be mocked.');
    }
}
