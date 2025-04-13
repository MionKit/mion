/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '@deepkit/type';
import type {MockOperation, JitConfig, jitCode} from '../../types';
import {toLiteral} from '../../lib/utils';
import {random} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.enum,
};

export class EnumRunType extends AtomicRunType<TypeEnum> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): jitCode {
        return this.src.values.map((v) => `${comp.vλl} === ${toLiteral(v)}`).join(' || ');
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
    _compileJsonStringify(comp: JitCompiler): jitCode {
        if (this.src.indexType.kind === ReflectionKind.number) return comp.vλl;
        return `JSON.stringify(${comp.vλl})`;
    }
    _mock(ctx: Pick<MockOperation, 'enumIndex'>): string | number | undefined | null {
        const i = ctx.enumIndex || random(0, this.src.values.length - 1);
        return this.src.values[i];
    }
}
