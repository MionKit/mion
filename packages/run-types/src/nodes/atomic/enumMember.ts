/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeEnum} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitCode} from '../../types';

// TODO: not sure when run type will be generated but doesn't seem to be used when using reflection on enums
export class EnumMemberRunType extends AtomicRunType<TypeEnum> {
    skipJit() {
        return true;
    }
    emitIsType(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
    emitTypeErrors(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
    emitPrepareForJson(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
    emitRestoreFromJson(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
}
