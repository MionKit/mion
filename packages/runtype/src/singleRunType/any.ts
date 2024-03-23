/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import {RunTypeOptions, RunTypeVisitor} from '../types';
import {mockAny} from '../mock';
import {BaseRunType} from '../baseRunType';

export class AnyRunType extends BaseRunType<TypeAny | TypeUnknown> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        src: TypeAny | TypeUnknown,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions,
        public readonly name = 'any'
    ) {
        super(visitor, src, nestLevel, opts);
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
