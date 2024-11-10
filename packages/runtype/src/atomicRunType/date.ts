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
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {ReflectionSubKinds} from '../reflectionNames';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: false,
    jitId: ReflectionSubKinds.date,
};

export class DateRunType extends AtomicRunType<TypeClass> {
    src: TypeClass = null as any; // will be set after construction
    getJitId = () => jitConstants.jitId;
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `(${cop.vλl} instanceof Date && !isNaN(${cop.vλl}.getTime()))`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (!(${this._compileIsType(cop)})) µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)})`;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        return DateJitJsonENcoder.encodeToJson(cop.vλl);
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return DateJitJsonENcoder.decodeFromJson(cop.vλl);
    }
    _compileJsonStringify(cop: JitCompiler): string {
        return DateJitJsonENcoder.stringify(cop.vλl);
    }
    mock(cop?: Pick<MockContext, 'minDate' | 'maxDate'>): Date {
        return mockDate(cop?.minDate, cop?.maxDate);
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
