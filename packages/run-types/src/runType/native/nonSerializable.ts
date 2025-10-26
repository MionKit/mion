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
    emitIsType(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitTypeErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitPrepareForJson(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitRestoreFromJson(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitHasUnknownKeys(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitUnknownKeyErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitStripUnknownKeys(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitUnknownKeysToUndefined(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
}
