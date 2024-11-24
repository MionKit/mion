/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConstants} from '../../types';
import {getJitErrorPath, getExpected} from '../../lib/utils';
import {mockString, random} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {stringCharSet} from '../../constants.mock';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.string,
};

export class StringRunType extends AtomicRunType<TypeString> {
    src: TypeString = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'string'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'string') utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)})`;
    }

    _compileJsonStringify(comp: JitCompiler): string {
        return `utl.asJSONString(${comp.vλl})`;
    }
    _mock(ctx: MockOperation): string {
        const length = ctx.stringLength || random(1, ctx.maxRandomStringLength);
        const charSet = ctx.stringCharSet || stringCharSet;
        return mockString(length, charSet);
    }
}
