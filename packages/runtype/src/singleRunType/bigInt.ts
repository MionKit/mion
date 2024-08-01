/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBigInt} from '../_deepkit/src/reflection/type';
import {JitErrorPath, JitJsonEncoder} from '../types';
import {toLiteral, pathChainToLiteral} from '../utils';
import {mockBigInt} from '../mock';
import {SingleRunType} from '../baseRunTypes';

export class BigIntRunType extends SingleRunType<TypeBigInt> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(varName: string): string {
        return `typeof ${varName} === 'bigint'`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return `if (typeof ${varName} !== 'bigint') ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(varName: string): string {
        return BigIntJitJsonENcoder.encodeToJson(varName);
    }
    compileJsonDecode(varName: string): string {
        return BigIntJitJsonENcoder.decodeFromJson(varName);
    }
    compileJsonStringify(varName: string): string {
        return BigIntJitJsonENcoder.stringify(varName);
    }
    mock(min?: number, max?: number): bigint {
        return mockBigInt(min, max);
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `${varName} = BigInt(${varName})`;
    },
    encodeToJson(varName: string): string {
        return `${varName} = ${varName}.toString()`;
    },
    stringify(varName: string): string {
        return `'"'+${varName}.toString()+'"'`;
    },
};
