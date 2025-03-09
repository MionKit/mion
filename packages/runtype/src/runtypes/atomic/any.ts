/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import type {JitConfig, JitFnID, MockOperation} from '../../types';
import {mockAny} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler} from '../../lib/jitCompiler';
import {JitFunctions} from '../../constants';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.any,
};

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    _getJitConfig = () => jitConstants;
    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFunctions.typeErrors.id:
                return false;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    _compileIsType(): undefined {
        return undefined;
    }
    _compileTypeErrors(): undefined {
        return undefined;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return `JSON.stringify(${comp.vλl})`;
    }
    _mock(ctx: Pick<MockOperation, 'anyValuesList'>): string {
        return mockAny(ctx.anyValuesList);
    }
}
