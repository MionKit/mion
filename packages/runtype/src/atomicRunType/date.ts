/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockContext, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockDate} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {dateJitId} from '../constants';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: false,
    jitId: dateJitId, // reflection kind + class name
};

export class DateRunType extends AtomicRunType<TypeClass> {
    src: TypeClass = null as any; // will be set after construction
    getJitId = () => 'date';
    getJitConstants = () => jitConstants;
    getName(): string {
        return 'date';
    }
    _compileIsType(cop: JitCompileOp): string {
        return `(${cop.vλl} instanceof Date && !isNaN(${cop.vλl}.getTime()))`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `if (!(${this._compileIsType(cop)})) ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return DateJitJsonENcoder.encodeToJson(cop.vλl);
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return DateJitJsonENcoder.decodeFromJson(cop.vλl);
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        return DateJitJsonENcoder.stringify(cop.vλl);
    }
    mock(cop?: Pick<MockContext, 'minDate' | 'maxDate'>): Date {
        return mockDate(cop?.minDate, cop?.maxDate);
    }
}

export const DateJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = new Date(${vλl})`;
    },
    encodeToJson(vλl: string): string {
        return vλl;
    },
    stringify(vλl: string): string {
        return `'"'+${vλl}.toJSON()+'"'`;
    },
};
