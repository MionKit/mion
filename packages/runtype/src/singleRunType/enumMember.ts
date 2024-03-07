/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeEnum} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class EnumMemberRunType implements RunType<TypeEnum> {
    public readonly name = 'enumMember';
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeEnum,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    isTypeJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
    typeErrorsJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
    jsonEncodeJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
    jsonStringifyJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
    jsonDecodeJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
    mockJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
}
