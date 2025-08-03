/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {jitCode} from '../../types';

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    _getTypeID = () => ReflectionKind.any;

    _compileIsType(): jitCode {
        return undefined;
    }
    _compileTypeErrors(): jitCode {
        return undefined;
    }
}
