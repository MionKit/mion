/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBigInt} from '@deepkit/type';
import {JitJsonEncoder, RunType, RunTypeVisitor} from '../types';

export class BigIntRunType implements RunType<TypeBigInt> {
    public readonly name = 'bigint';
    public readonly shouldEncodeJson = true;
    public readonly shouldDecodeJson = true;
    constructor(
        public readonly src: TypeBigInt,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `typeof ${varName} === 'bigint'`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, itemPath: string): string {
        return `if (typeof ${varName} !== 'bigint') ${errorsName}.push({path: ${itemPath}, message:'Expected to be a valid Bigint'})`;
    }
    getJsonEncodeCode(varName: string): string {
        return BigIntJitJsonENcoder.encodeToJson(varName);
    }
    getJsonDecodeCode(varName: string): string {
        return BigIntJitJsonENcoder.decodeFromJson(varName);
    }
    getMockCode(varName: string): string {
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
