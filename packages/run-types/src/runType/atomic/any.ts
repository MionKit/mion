/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import type {JitConfig, jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.any,
};

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    getJitConfig = () => jitConstants;

    private getTypeKindName(): string {
        return this.src.kind === ReflectionKind.any ? 'any' : 'unknown';
    }

    _compileIsType(): jitCode {
        throw new Error(`Cannot compile isType for ${this.getTypeKindName()} type.`);
    }

    _compileTypeErrors(): jitCode {
        throw new Error(`Cannot compile typeErrors for ${this.getTypeKindName()} type.`);
    }

    _compileToJsonVal(): jitCode {
        throw new Error(`Cannot compile toJsonVal for ${this.getTypeKindName()} type.`);
    }

    _compileFromJsonVal(): jitCode {
        throw new Error(`Cannot compile fromJsonVal for ${this.getTypeKindName()} type.`);
    }

    _compileJsonStringify(): jitCode {
        throw new Error(`Cannot compile jsonStringify for ${this.getTypeKindName()} type.`);
    }

    _compileHasUnknownKeys(): jitCode {
        throw new Error(`Cannot compile hasUnknownKeys for ${this.getTypeKindName()} type.`);
    }

    _compileUnknownKeyErrors(): jitCode {
        throw new Error(`Cannot compile unknownKeyErrors for ${this.getTypeKindName()} type.`);
    }

    _compileStripUnknownKeys(): jitCode {
        throw new Error(`Cannot compile stripUnknownKeys for ${this.getTypeKindName()} type.`);
    }

    _compileUnknownKeysToUndefined(): jitCode {
        throw new Error(`Cannot compile unknownKeysToUndefined for ${this.getTypeKindName()} type.`);
    }
}
