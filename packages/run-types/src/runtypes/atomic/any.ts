/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import type {JitConfig, MockOperation, jitCode} from '../../types';
import {mockAny} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.any,
};

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    getJitConfig = () => jitConstants;
    _compileIsType(): jitCode {
        return undefined;
    }
    _compileTypeErrors(): jitCode {
        return undefined;
    }
    _compileJsonStringify(comp: JitCompiler): jitCode {
        return `JSON.stringify(${comp.vλl})`;
    }
    _mock(ctx: Pick<MockOperation, 'anyValuesList'>): string {
        return mockAny(ctx.anyValuesList);
    }
}
