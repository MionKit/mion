/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../../lib/_deepkit/src/reflection/type';
import type {JitConfig, JitFnID, MockOperation} from '../../types';
import {mockAny} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler} from '../../lib/jitCompiler';
import {JitFnIDs} from '../../constants';

const jitConstants: JitConfig = {
    skipJit: false,
    skipToJsonVal: true,
    skipFromJsonVal: true,
    jitId: ReflectionKind.any,
};

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    getJitConfig = () => jitConstants;
    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.typeErrors:
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
