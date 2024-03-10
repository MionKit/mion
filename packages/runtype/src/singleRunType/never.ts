/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNever} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';

export class NeverRunType implements RunType<TypeNever> {
    public readonly name = 'never';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeNever,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {}
    isTypeJIT(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    typeErrorsJIT(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    jsonEncodeJIT(): string {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    jsonStringifyJIT(): string {
        throw new Error('Never type cannot be stringified.');
    }
    jsonDecodeJIT(): string {
        throw new Error('Never type cannot be decoded from JSON.');
    }
    mock() {
        throw new Error('Never type cannot be mocked.');
    }
}
