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
    _getTypeID = () => ReflectionKind.enumMember;
    _compileIsType(): jitCode {
        return {
            code: '',
            codeType: 'E',
            skipJit: true
        };
    }
    _compileTypeErrors(): jitCode {
        return {
            code: '',
            codeType: 'S',
            skipJit: true
        };
    }
    _compileToJsonVal(): jitCode {
        return {
            code: '',
            codeType: 'S',
            skipJit: true
        };
    }
    _compileFromJsonVal(): jitCode {
        return {
            code: '',
            codeType: 'S',
            skipJit: true
        };
    }
}
