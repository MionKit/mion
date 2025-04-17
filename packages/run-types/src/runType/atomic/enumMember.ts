/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeEnum} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {jitCode} from '../../types';

// TODO: not sure when run type will be generated but doesn't seem to be used when using reflection on enums
export class EnumMemberRunType extends AtomicRunType<TypeEnum> {
    getTypeID = () => ReflectionKind.enumMember;
    skipJit() {
        return true;
    }
    _compileIsType(): jitCode {
        throw new Error('Enum member operations are not supported');
    }
    _compileTypeErrors(): jitCode {
        throw new Error('Enum member operations are not supported');
    }
    _compileToJsonVal(): jitCode {
        throw new Error('Enum member operations are not supported');
    }
    _compileFromJsonVal(): jitCode {
        throw new Error('Enum member operations are not supported');
    }
}
