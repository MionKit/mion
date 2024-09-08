/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeBigInt} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockContext, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockBigInt} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `typeof ${ctx.args.vλl} === 'bigint'`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (typeof ${ctx.args.vλl} !== 'bigint') ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return BigIntJitJsonENcoder.encodeToJson(ctx.args.vλl);
    }
    compileJsonDecode(ctx: JitContext): string {
        return BigIntJitJsonENcoder.decodeFromJson(ctx.args.vλl);
    }
    compileJsonStringify(jc: JitContext): string {
        return BigIntJitJsonENcoder.stringify(jc.args.vλl);
    }

    /** mocks a regular number and transforms into a bigint.
     * this means range is limited to Number.MAX_SAFE_INTEGER
     */
    mock(ctx?: Pick<MockContext, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(ctx?.minNumber, ctx?.maxNumber);
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = BigInt(${vλl})`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl} = ${vλl}.toString()`;
    },
    stringify(vλl: string): string {
        return `'"'+${vλl}.toString()+'"'`;
    },
};
