/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeEnum} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitCode} from '../../types';

// TODO: not sure when run type will be generated but doesn't seem to be used when using reflection on enums
export class EnumMemberRunType extends AtomicRunType<TypeEnum> {
    _getTypeID = () => ReflectionKind.enumMember;
    skipJit() {
        return true;
    }
    _compileIsType(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
    _compileTypeErrors(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
    _compileToJsonVal(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
    _compileFromJsonVal(): JitCode {
        throw new Error('Enum member operations are not supported');
    }
}
