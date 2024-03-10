/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBigInt} from '../_deepkit/src/reflection/type';
import {JitJsonEncoder, RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {mockBigInt} from '../mock';

export class BigIntRunType implements RunType<TypeBigInt> {
    public readonly name = 'bigint';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    constructor(
        public readonly src: TypeBigInt,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'bigint'`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'bigint') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return BigIntJitJsonENcoder.encodeToJson(varName);
    }
    jsonStringifyJIT(varName: string): string {
        return BigIntJitJsonENcoder.stringify(varName);
    }
    jsonDecodeJIT(varName: string): string {
        return BigIntJitJsonENcoder.decodeFromJson(varName);
    }
    mock(min?: number, max?: number): bigint {
        return mockBigInt(min, max);
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `BigInt(${varName}.substring(0, ${varName}.length - 1))`;
    },
    encodeToJson(varName: string): string {
        return `${varName}.toString() + 'n'`;
    },
    stringify(varName: string): string {
        return `JSON.stringify(${varName}.toString() + 'n')`;
    },
};
