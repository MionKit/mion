/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '@deepkit/type';
import type {MockOperation, JitConfig, jitCode} from '../../types';
import {mockString, random} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {stringCharSet} from '../../constants.mock';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.string,
};

export class StringRunType extends AtomicRunType<TypeString> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): jitCode {
        return `typeof ${comp.vλl} === 'string'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (typeof ${comp.vλl} !== 'string') ${comp.callJitErr(this)}`;
    }

    _compileJsonStringify(comp: JitCompiler): jitCode {
        return `utl.asJSONString(${comp.vλl})`;
    }
    _mock(ctx: MockOperation): string {
        const length = ctx.stringLength || random(1, ctx.maxRandomStringLength);
        const charSet = ctx.stringCharSet || stringCharSet;
        return mockString(length, charSet);
    }
}
