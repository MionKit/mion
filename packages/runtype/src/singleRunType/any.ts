/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAny, TypeUnknown} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';

export class AnyRunType implements RunType<TypeAny | TypeUnknown> {
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeAny | TypeUnknown,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(): string {
        return `true`;
    }
    getValidateCodeWithErrors(): string {
        return ``;
    }
    getJsonEncodeCode(varName: string): string {
        return `${varName}`;
    }
    getJsonDecodeCode(varName: string): string {
        return `${varName}`;
    }
    getMockCode(varName: string): string {
        return (
            `const anyValue = [{}, {hello: 'world'}, [], [1, 3, 'hello'], 'hello', 1234, BigInt(1), true, false, null, undefined, Symbol('hello'), -124, 0, 124, 0.1, -0.1, Infinity, NaN, new Date()];` +
            `${varName} = anyValue[Math.floor(Math.random() * anyValue.length)]`
        );
    }
}
