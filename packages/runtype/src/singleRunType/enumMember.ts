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
    getValidateCode(): string {
        throw new Error('Enum member operations are not supported');
    }
    getValidateCodeWithErrors(): string {
        throw new Error('Enum member operations are not supported');
    }
    getJsonEncodeCode(): string {
        throw new Error('Enum member operations are not supported');
    }
    getJsonDecodeCode(): string {
        throw new Error('Enum member operations are not supported');
    }
    getMockCode(): string {
        throw new Error('Enum member operations are not supported');
    }
}
