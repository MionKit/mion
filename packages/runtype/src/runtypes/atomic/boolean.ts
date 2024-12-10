/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBoolean} from '../../lib/_deepkit/src/reflection/type';
import type {JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockBoolean} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {booleanSerializer} from '../../serializers/boolean';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.boolean,
};
export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'boolean'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'boolean') ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return booleanSerializer.ToJsonVal(comp.vλl);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return booleanSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return booleanSerializer.stringify(comp.vλl);
    }
    _mock(): boolean {
        return mockBoolean();
    }
}
