/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNever} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class NeverRunType implements RunType<TypeNever> {
    public readonly name = 'never';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        public readonly src: TypeNever,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
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