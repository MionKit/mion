/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCode} from '../../types';
import {JitFnCompiler} from '../../lib/jitFnCompiler';

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    _getTypeID = () => ReflectionKind.any;

    emitIsType(comp: JitFnCompiler): JitCode {
        const isRoot = comp.getNestLevel(this) === 0;
        if (isRoot) return {code: undefined, type: 'E'};
        return {code: 'true', type: 'E'};
    }
    emitTypeErrors(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
