/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../_deepkit/src/reflection/type';
import type {JitConstants, JitOperation, MockContext} from '../types';
import {mockAny} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.any,
};

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    src: TypeAny | TypeUnknown = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return this.src.kind === ReflectionKind.any ? 'any' : 'unknown';
    }
    _compileIsType(): 'true' {
        return 'true';
    }
    _compileTypeErrors(): '' {
        return '';
    }
    _compileJsonEncode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonDecode(op: JitOperation): string {
        return op.args.vλl;
    }
    _compileJsonStringify(op: JitOperation): string {
        return `JSON.stringify(${op.args.vλl})`;
    }
    mock(ctx?: Pick<MockContext, 'anyValuesLis'>): string {
        return mockAny(ctx?.anyValuesLis);
    }
}
