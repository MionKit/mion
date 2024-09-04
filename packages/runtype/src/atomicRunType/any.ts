/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import type {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
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
    compileJsonStringify(parents: RunType[], varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    mock(anyValuesLis?: any[]): string {
        return mockAny(anyValuesLis);
    }
}
