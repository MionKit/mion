/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass, TypeObjectLiteral} from '@deepkit/type';
import {jitCode} from '../../types';
import {InterfaceRunType} from '../collection/interface';

// Non serializable types might not be Atomic but will be skipped so it doesn't matter
export class NonSerializableRunType extends InterfaceRunType<TypeObjectLiteral | TypeClass> {
    // NonSerializableRunType throws errors for all operations
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
