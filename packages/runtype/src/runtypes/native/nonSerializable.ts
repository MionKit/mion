/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass, TypeObjectLiteral} from '../../lib/_deepkit/src/reflection/type';
import {BaseRunType} from '../../lib/baseRunTypes';
import {JitConfig} from '../../types';
import {InterfaceRunType} from '../collection/interface';

// Non serializable types might not be Atomic but will be skipped so it doesn't matter
export class NonSerializableRunType extends InterfaceRunType<TypeObjectLiteral | TypeClass> {
    getJitConfig(stack?: BaseRunType[]): JitConfig {
        // skip return false so we ensure the compile functions will throw when a NonSerializable type is used
        return {
            ...super.getJitConfig(stack),
            skipToJsonVal: false,
            skipFromJsonVal: false,
            skipJit: false,
        };
    }
    _compileIsType(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileTypeErrors(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileToJsonVal(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileFromJsonVal(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileJsonStringify(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileHasUnknownKeys(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileUnknownKeyErrors(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileStripUnknownKeys(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileUnknownKeysToUndefined(): string {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _mock(): any {
        throw new Error(`Mock is disabled for Non Serializable types.`);
    }
}
