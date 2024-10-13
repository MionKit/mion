/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '../_deepkit/src/reflection/type';
import type {MockContext, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockNumber} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.number,
};

export class NumberRunType extends AtomicRunType<TypeNumber> {
    src: TypeNumber = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    getName(): string {
        return 'number';
    }
    _compileIsType(cop: JitCompileOp): string {
        const {vλl: value} = cop.args;
        return `Number.isFinite(${value})`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const {εrrors: errors} = cop.args;
        return `if(!(${this._compileIsType(cop)})) ${errors}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return cop.vλl;
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return cop.vλl;
    }
    _compileJsonStringify(jc: JitCompileOp): string {
        return jc.args.vλl;
    }
    mock(cop?: Pick<MockContext, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(cop?.minNumber, cop?.maxNumber);
    }
}
