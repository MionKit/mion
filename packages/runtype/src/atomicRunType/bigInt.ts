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
import type {
    jitIsTypeCompileOperation,
    JitJsonDecodeCompileOperation,
    JitJsonEncodeCompileOperation,
    JitJsonStringifyCompileOperation,
    JitTypeErrorCompileOperation,
} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    src: TypeBigInt = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: jitIsTypeCompileOperation): string {
        return `typeof ${cop.vλl} === 'bigint'`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOperation): string {
        return `if (typeof ${cop.vλl} !== 'bigint') ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitJsonEncodeCompileOperation): string {
        return BigIntJitJsonENcoder.encodeToJson(cop.vλl);
    }
    _compileJsonDecode(cop: JitJsonDecodeCompileOperation): string {
        return BigIntJitJsonENcoder.decodeFromJson(cop.vλl);
    }
    _compileJsonStringify(cop: JitJsonStringifyCompileOperation): string {
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
