/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '../_deepkit/src/reflection/type';
import type {JitOperation, JitJsonEncoder, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockBigInt} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    isCircularRef: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    src: TypeBigInt = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'bigint';
    }
    _compileIsType(stack: JitOperation): string {
        return `typeof ${stack.args.vλl} === 'bigint'`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (typeof ${stack.args.vλl} !== 'bigint') ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(stack: JitOperation): string {
        return BigIntJitJsonENcoder.encodeToJson(stack.args.vλl);
    }
    _compileJsonDecode(stack: JitOperation): string {
        return BigIntJitJsonENcoder.decodeFromJson(stack.args.vλl);
    }
    _compileJsonStringify(jc: JitOperation): string {
        return BigIntJitJsonENcoder.stringify(jc.args.vλl);
    }
    /** mocks a regular number and transforms into a bigint.
     * this means range is limited to Number.MAX_SAFE_INTEGER
     */
    mock(stack?: Pick<MockContext, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(stack?.minNumber, stack?.maxNumber);
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
