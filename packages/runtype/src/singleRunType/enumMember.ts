/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeEnum} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';

export class EnumMemberRunType implements RunType<TypeEnum> {
    public readonly name = 'enumMember';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeEnum,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
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
    jsonDecodeJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
    jsonStringifyJIT(): string {
        throw new Error('Enum member operations are not supported');
    }
    mock() {
        throw new Error('Enum member operations are not supported');
    }
}
