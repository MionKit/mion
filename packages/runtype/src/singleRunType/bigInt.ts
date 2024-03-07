/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBigInt} from '@deepkit/type';
import {JitJsonEncoder, RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class BigIntRunType implements RunType<TypeBigInt> {
    public readonly name = 'bigint';
    public readonly shouldEncodeJson = true;
    public readonly shouldDecodeJson = true;
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
    jsonDecodeJIT(varName: string): string {
        return BigIntJitJsonENcoder.decodeFromJson(varName);
    }
    mockJIT(varName: string): string {
        return `${varName} = BigInt(Math.floor(Math.random() * 1000000))`;
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `BigInt(${varName}.substring(0, ${varName}.length - 1))`;
    },
    encodeToJson(varName: string): string {
        return `${varName}.toString() + 'n'`;
    },
};
