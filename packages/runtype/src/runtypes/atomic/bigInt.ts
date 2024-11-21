/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '../../lib/_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockOperation, JitConstants} from '../../types';
import {getJitErrorPath, getExpected} from '../../lib/utils';
import {mockBigInt} from '../../lib/mock';
import {AtomicRunType} from '../../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    src: TypeBigInt = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'bigint'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'bigint') utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)})`;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        return BigIntJitJsonENcoder.encodeToJson(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler): string {
        return BigIntJitJsonENcoder.decodeFromJson(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return BigIntJitJsonENcoder.stringify(comp.vλl);
    }
    /** mocks a regular number and transforms into a bigint.
     * this means range is limited to Number.MAX_SAFE_INTEGER
     */
    _mock(ctx: Pick<MockOperation, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(ctx.minNumber, ctx.maxNumber);
    }
}

export const BigIntJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `BigInt(${vλl})`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl}.toString()`;
    },
    stringify(vλl: string): string {
        return `'"'+${vλl}.toString()+'"'`;
    },
};
