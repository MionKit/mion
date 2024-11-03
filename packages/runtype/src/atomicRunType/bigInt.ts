/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockContext, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockBigInt} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    src: TypeBigInt = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `typeof ${cop.vλl} === 'bigint'`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (typeof ${cop.vλl} !== 'bigint') µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)})`;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        return BigIntJitJsonENcoder.encodeToJson(cop.vλl);
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return BigIntJitJsonENcoder.decodeFromJson(cop.vλl);
    }
    _compileJsonStringify(cop: JitCompiler): string {
        return BigIntJitJsonENcoder.stringify(cop.vλl);
    }
    /** mocks a regular number and transforms into a bigint.
     * this means range is limited to Number.MAX_SAFE_INTEGER
     */
    mock(cop?: Pick<MockContext, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(cop?.minNumber, cop?.maxNumber);
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
