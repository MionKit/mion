/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeBigInt} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockOptions, TypeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockBigInt} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `typeof ${ctx.args.value} === 'bigint'`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (typeof ${ctx.args.value} !== 'bigint') ${ctx.args.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return BigIntJitJsonENcoder.encodeToJson(ctx.args.value);
    }
    compileJsonDecode(ctx: JitContext): string {
        return BigIntJitJsonENcoder.decodeFromJson(ctx.args.value);
    }
    compileJsonStringify(jc: JitContext): string {
        return BigIntJitJsonENcoder.stringify(jc.args.value);
    }

    /** this mocks a regular number and transforms into a bigint */
    mock(ctx?: Pick<MockOptions, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(ctx?.minNumber, ctx?.maxNumber);
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
