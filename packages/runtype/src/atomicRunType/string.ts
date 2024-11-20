/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '../_deepkit/src/reflection/type';
import type {MockOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockString, random} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {stringCharSet} from '../constants';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.string,
};

export class StringRunType extends AtomicRunType<TypeString> {
    src: TypeString = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return `typeof ${cop.vλl} === 'string'`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (typeof ${cop.vλl} !== 'string') utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)})`;
    }

    _compileJsonStringify(cop: JitCompiler): string {
        return `utl.asJSONString(${cop.vλl})`;
    }
    _mock(ctx: MockOperation): string {
        const length = ctx.stringLength || random(1, ctx.maxRandomStringLength);
        const charSet = ctx.stringCharSet || stringCharSet;
        return mockString(length, charSet);
    }
}
