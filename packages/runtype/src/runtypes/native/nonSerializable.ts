/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AtomicRunType} from '../../lib/baseRunTypes';

// Non serializable types might not be Atomic but will be skipped so it doesn't matter
export class NonSerializableRunType extends AtomicRunType<any> {
    getJitConfig() {
        const kind = this.src.subKind || this.src.kind;
        const name = this.src.typeName || this.src.classType?.constructor?.name || '';
        return {
            skipJit: true,
            skipJsonEncode: true,
            skipJsonDecode: true,
            jitId: `${kind}${name}`,
        };
    }
    _compileIsType(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileTypeErrors(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileJsonEncode(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileJsonDecode(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileJsonStringify(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _mock(): any {
        throw new Error(`Mock is disabled for Non Serializable types.`);
    }
}
