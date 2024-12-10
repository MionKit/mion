/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockRegExp} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {regexpSerializer} from '../../serializers/regexp';

const jitConstants: JitConfig = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.regexp,
};

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `(${comp.vλl} instanceof RegExp)`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (!(${comp.vλl} instanceof RegExp)) ${comp.callJitErr(this)}`;
    }
    _compileJsonEncode(comp: JitCompiler) {
        return regexpSerializer.toJsonVal(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler) {
        return regexpSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return regexpSerializer.stringify(comp.vλl);
    }
    _mock(ctx: Pick<MockOperation, 'regexpList'>): RegExp {
        return mockRegExp(ctx.regexpList);
    }
}
