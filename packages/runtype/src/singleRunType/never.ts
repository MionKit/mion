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
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeNever,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    getValidateCodeWithErrors(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    getJsonEncodeCode(): string {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    getJsonDecodeCode(): string {
        throw new Error('Never type cannot be decoded from JSON.');
    }
    getMockCode(): string {
        throw new Error('Never type cannot be mocked.');
    }
}
