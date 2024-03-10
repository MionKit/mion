/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {mockAny} from '../mock';

export class AnyRunType implements RunType<TypeAny | TypeUnknown> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeAny | TypeUnknown,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions,
        public readonly name = 'any'
    ) {}
    isTypeJIT(): string {
        return `true`;
    }
    typeErrorsJIT(): string {
        return ``;
    }
    jsonEncodeJIT(varName: string): string {
        return varName;
    }
    jsonStringifyJIT(varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    mock(anyValuesLis?: any[]): string {
        return mockAny(anyValuesLis);
    }
}
