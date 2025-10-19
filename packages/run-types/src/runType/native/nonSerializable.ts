/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass, TypeObjectLiteral} from '@deepkit/type';
import {JitCode} from '../../types';
import {InterfaceRunType} from '../collection/interface';

// Non serializable types might not be Atomic but will be skipped so it doesn't matter
export class NonSerializableRunType extends InterfaceRunType<TypeObjectLiteral | TypeClass> {
    skipJit() {
        // skip return false so we ensure the compile functions will throw when a NonSerializable type is used
        return false;
    }
    _compileIsType(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileTypeErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileToJsonVal(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileFromJsonVal(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileHasUnknownKeys(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileUnknownKeyErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileStripUnknownKeys(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileUnknownKeysToUndefined(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
}
