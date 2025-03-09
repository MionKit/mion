/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBoolean} from '@deepkit/type';
import type {JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockBoolean} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.boolean,
};
export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    _getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'boolean'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'boolean') ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal() {
        return undefined;
    }
    _compileFromJsonVal() {
        return undefined;
    }
    _compileJsonStringify(comp: JitCompiler) {
        return `(${comp.vλl} ? 'true' : 'false')`;
    }
    _mock(): boolean {
        return mockBoolean();
    }
}
