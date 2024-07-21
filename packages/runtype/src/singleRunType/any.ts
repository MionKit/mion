/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {mockAny} from '../mock';
import {SingleRunType} from '../baseRunTypes';

export class AnyRunType extends SingleRunType<TypeAny | TypeUnknown> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeAny | TypeUnknown,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions,
        public readonly slug = 'any'
    ) {
        super(visitor, src, parents, opts);
    }
    JIT_isType(): string {
        return `true`;
    }
    JIT_typeErrors(): string {
        return ``;
    }
    JIT_jsonEncode(): string {
        return '';
    }
    JIT_jsonDecode(): string {
        return '';
    }
    JIT_jsonStringify(varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    mock(anyValuesLis?: any[]): string {
        return mockAny(anyValuesLis);
    }
}
