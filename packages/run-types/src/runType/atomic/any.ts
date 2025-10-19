/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCode} from '../../types';

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    _getTypeID = () => ReflectionKind.any;

    _compileIsType(): JitCode {
        return {code: undefined, type: 'E'};
    }
    _compileTypeErrors(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
