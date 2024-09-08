/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNumber} from '../_deepkit/src/reflection/type';
import type {JitContext, MockOptions, TypeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockNumber} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class NumberRunType extends AtomicRunType<TypeNumber> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        const {value} = ctx.args;
        return `(typeof ${value} === 'number' && Number.isFinite(${value}))`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const {errors} = ctx.args;
        return `if(!(${this.compileIsType(ctx)})) ${errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(jc: JitContext): string {
        return jc.args.value;
    }
    mock(ctx?: Pick<MockOptions, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(ctx?.minNumber, ctx?.maxNumber);
    }
}
