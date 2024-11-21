/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../../_deepkit/src/reflection/type';
import type {JitConstants, JitFnID, MockOperation} from '../../types';
import {mockAny} from '../../lib/mock';
import {AtomicRunType} from '../../baseRunTypes';
import type {JitCompiler} from '../../lib/jitCompiler';
import {JitFnIDs} from '../../constants';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.any,
};

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    src: TypeAny | TypeUnknown = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.typeErrors:
                return false;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }
    _compileIsType(): 'true' {
        return 'true';
    }
    _compileTypeErrors(): '' {
        return '';
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return `JSON.stringify(${comp.vλl})`;
    }
    _mock(ctx: Pick<MockOperation, 'anyValuesList'>): string {
        return mockAny(ctx.anyValuesList);
    }
}
