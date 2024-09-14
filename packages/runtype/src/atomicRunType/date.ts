/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '../_deepkit/src/reflection/type';
import type {JitOperation, JitJsonEncoder, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockDate} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {dateJitId} from '../constants';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: false,
    isCircularRef: false,
    jitId: dateJitId, // reflection kind + class name
};

export class DateRunType extends AtomicRunType<TypeClass> {
    src: TypeClass = null as any; // will be set after construction
    getJitId = () => 'date';
    constants = () => jitConstants;
    getName(): string {
        return 'date';
    }
    _compileIsType(stack: JitOperation): string {
        return `(${stack.args.vλl} instanceof Date && !isNaN(${stack.args.vλl}.getTime()))`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (!(${this._compileIsType(stack)})) ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(stack: JitOperation): string {
        return DateJitJsonENcoder.encodeToJson(stack.args.vλl);
    }
    _compileJsonDecode(stack: JitOperation): string {
        return DateJitJsonENcoder.decodeFromJson(stack.args.vλl);
    }
    _compileJsonStringify(stack: JitOperation): string {
        return DateJitJsonENcoder.stringify(stack.args.vλl);
    }
    mock(stack?: Pick<MockContext, 'minDate' | 'maxDate'>): Date {
        return mockDate(stack?.minDate, stack?.maxDate);
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
