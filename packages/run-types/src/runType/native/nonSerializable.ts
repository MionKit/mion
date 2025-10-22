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
    visitIsType(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitTypeErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitToJsonVal(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitFromJsonVal(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitHasUnknownKeys(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitUnknownKeyErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitStripUnknownKeys(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitUnknownKeysToUndefined(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
}
