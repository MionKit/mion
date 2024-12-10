/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '../../lib/_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitConfig} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {undefinedSerializer} from '../../serializers/undefined';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.undefined,
};

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'undefined'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return undefinedSerializer.ToJsonVal(comp.vλl);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return undefinedSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return undefinedSerializer.stringify(comp.vλl);
    }
    _mock(): undefined {
        return undefined;
    }
}
