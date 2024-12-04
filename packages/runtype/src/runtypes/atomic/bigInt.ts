/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '../../lib/_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockOperation, JitConfig} from '../../types';
import {mockBigInt} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConfig = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'bigint'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`;
    }
    _compileJsonEncode(comp: JitCompiler) {
        return BigIntJitJsonEncoder.encodeToJson(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler) {
        return BigIntJitJsonEncoder.decodeFromJson(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return BigIntJitJsonEncoder.stringify(comp.vλl);
    }
    /** mocks a regular number and transforms into a bigint.
     * this means range is limited to Number.MAX_SAFE_INTEGER
     */
    _mock(ctx: Pick<MockOperation, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(ctx.minNumber, ctx.maxNumber);
    }
}

export const BigIntJitJsonEncoder: JitJsonEncoder = {
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
