/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeBigInt} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, RunType} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockBigInt} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(parents: RunType[], varName: string): string {
        return `typeof ${varName} === 'bigint'`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if (typeof ${varName} !== 'bigint') ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return BigIntJitJsonENcoder.encodeToJson(varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return BigIntJitJsonENcoder.decodeFromJson(varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
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
