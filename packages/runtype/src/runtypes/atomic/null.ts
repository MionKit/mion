/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNull} from '../../lib/_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitConfig} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {nullSerializer} from '../../serializers/null';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.null,
};

export class NullRunType extends AtomicRunType<TypeNull> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `${comp.vλl} === null`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (${comp.vλl} !== null) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return nullSerializer.ToJsonVal(comp.vλl);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return nullSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return nullSerializer.stringify(comp.vλl);
    }
    _mock(): null {
        return null;
    }
}
