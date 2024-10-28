/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '../_deepkit/src/reflection/type';
import type {MockContext, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockString, random} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames, stringCharSet} from '../constants';
import {JitDefaultOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.string,
};

export class StringRunType extends AtomicRunType<TypeString> {
    src: TypeString = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitDefaultOp): string {
        return `typeof ${cop.vλl} === 'string'`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `if (typeof ${cop.vλl} !== 'string') ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitDefaultOp): string {
        return cop.vλl;
    }
    _compileJsonDecode(cop: JitDefaultOp): string {
        return cop.vλl;
    }
    _compileJsonStringify(cop: JitDefaultOp): string {
        return `${jitNames.utils}.asJSONString(${cop.vλl})`;
    }
    mock(cop?: Pick<MockContext, 'stringLength' | 'stringCharSet'>): string {
        const length = cop?.stringLength || random(1, 500);
        const charSet = cop?.stringCharSet || stringCharSet;
        return mockString(length, charSet);
    }
}
