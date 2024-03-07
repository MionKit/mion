/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAny, TypeUnknown} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class AnyRunType implements RunType<TypeAny | TypeUnknown> {
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeAny | TypeUnknown,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number,
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
    mockJIT(varName: string): string {
        const valuesList = `anyVal${this.nestLevel}`;
        return (
            `const ${valuesList} = [{}, {hello: 'world'}, [], [1, 3, 'hello'], 'hello', 1234, BigInt(1), true, false, null, undefined, Symbol('hello'), -124, 0, 124, 0.1, -0.1, Infinity, NaN, new Date()];` +
            `${varName} =  ${valuesList}[Math.floor(Math.random() *  ${valuesList}.length)]`
        );
    }
}
