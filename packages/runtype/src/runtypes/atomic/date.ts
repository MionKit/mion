/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '../../lib/_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockOperation, JitConstants} from '../../types';
import {mockDate} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {ReflectionSubKind} from '../../constants.kind';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: false,
    jitId: ReflectionSubKind.date,
};

export class DateRunType extends AtomicRunType<TypeClass> {
    getJitId = () => jitConstants.jitId;
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        return DateJitJsonENcoder.encodeToJson(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler): string {
        return DateJitJsonENcoder.decodeFromJson(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return DateJitJsonENcoder.stringify(comp.vλl);
    }
    _mock(ctx: Pick<MockOperation, 'minDate' | 'maxDate'>): Date {
        return mockDate(ctx.minDate, ctx.maxDate);
    }
}

export const DateJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `new Date(${vλl})`;
    },
    encodeToJson(vλl: string): string {
        return vλl;
    },
    stringify(vλl: string): string {
        return `'"'+${vλl}.toJSON()+'"'`;
    },
};
