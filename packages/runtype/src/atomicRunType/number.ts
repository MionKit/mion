/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNumber} from '../_deepkit/src/reflection/type';
import type {JitContext, MockContext, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockNumber} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class NumberRunType extends AtomicRunType<TypeNumber> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        const {vλl: value} = ctx.args;
        return `Number.isFinite(${value})`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const {εrrors: errors} = ctx.args;
        return `if(!(${this.compileIsType(ctx)})) ${errors}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(jc: JitContext): string {
        return jc.args.vλl;
    }
    mock(ctx?: Pick<MockContext, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(ctx?.minNumber, ctx?.maxNumber);
    }
}
