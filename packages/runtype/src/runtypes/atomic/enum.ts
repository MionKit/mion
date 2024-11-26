/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConstants} from '../../types';
import {getExpected, toLiteral} from '../../lib/utils';
import {random} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.enum,
};

export class EnumRunType extends AtomicRunType<TypeEnum> {
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return this.src.values.map((v) => `${comp.vλl} === ${toLiteral(v)}`).join(' || ');
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(getExpected(this))}`;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        if (this.src.indexType.kind === ReflectionKind.number) return comp.vλl;
        return `JSON.stringify(${comp.vλl})`;
    }
    _mock(ctx: Pick<MockOperation, 'enumIndex'>): string | number | undefined | null {
        const i = ctx.enumIndex || random(0, this.src.values.length - 1);
        return this.src.values[i];
    }
}
