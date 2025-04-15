/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass, TypeObjectLiteral} from '@deepkit/type';
import {BaseRunType} from '../../lib/baseRunTypes';
import {JitConfig, jitCode} from '../../types';
import {InterfaceRunType} from '../collection/interface';

// Non serializable types might not be Atomic but will be skipped so it doesn't matter
export class NonSerializableRunType extends InterfaceRunType<TypeObjectLiteral | TypeClass> {
    getJitConfig(stack?: BaseRunType[]): JitConfig {
        // skip return false so we ensure the compile functions will throw when a NonSerializable type is used
        return {
            ...super.getJitConfig(stack),
            skipJit: false,
        };
    }
    _compileIsType(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileTypeErrors(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileToJsonVal(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileFromJsonVal(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileHasUnknownKeys(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileUnknownKeyErrors(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileStripUnknownKeys(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileUnknownKeysToUndefined(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
}
