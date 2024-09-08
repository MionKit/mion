/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import type {JitContext, MockContext, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {mockAny} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class AnyRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeAny | TypeUnknown,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
    }
    compileIsType(): string {
        return `true`;
    }
    compileTypeErrors(): string {
        return ``;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(ctx: JitContext): string {
        return `JSON.stringify(${ctx.args.vλl})`;
    }
    mock(ctx?: Pick<MockContext, 'anyValuesLis'>): string {
        return mockAny(ctx?.anyValuesLis);
    }
}
