/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNever} from '../../lib/_deepkit/src/reflection/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitErrorsCompiler} from '../../lib/jitCompiler';
import {JitConstants} from '../../types';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.never,
};
export class NeverRunType extends AtomicRunType<TypeNever> {
    getJitConstants = () => jitConstants;
    _compileIsType(): string {
        return 'false';
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `${comp.callJitErr(this)}`;
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
    _mock() {
        throw new Error('Never type cannot be mocked.');
    }
}
