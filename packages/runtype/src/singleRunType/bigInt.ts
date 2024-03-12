/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBigInt} from '../_deepkit/src/reflection/type';
import {JitJsonEncoder} from '../types';
import {toLiteral} from '../utils';
import {mockBigInt} from '../mock';
import {BaseRunType} from '../baseRunType';

export class BigIntRunType extends BaseRunType<TypeBigInt> {
    public readonly name = 'bigint';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    JIT_isType(varName: string): string {
        return `typeof ${varName} === 'bigint'`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'bigint') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return BigIntJitJsonENcoder.encodeToJson(varName);
    }
    JIT_jsonDecode(varName: string): string {
        return BigIntJitJsonENcoder.decodeFromJson(varName);
    }
    JIT_jsonStringify(varName: string): string {
        return BigIntJitJsonENcoder.stringify(varName);
    }
    mock(min?: number, max?: number): bigint {
        return mockBigInt(min, max);
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `BigInt(${varName})`;
    },
    encodeToJson(varName: string): string {
        return `${varName}.toString()`;
    },
    stringify(varName: string): string {
        return `'"'+${varName}.toString()+'"'`;
    },
};
