/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNull} from '../_deepkit/src/reflection/type';
import type {JitContext, TypeErrorsContext} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';

export class NullRunType extends AtomicRunType<TypeNull> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        return `${ctx.args.vλl} === null`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (${ctx.args.vλl} !== null) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(ctx: JitContext): string {
        return ctx.args.vλl;
    }
    mock(): null {
        return null;
    }
}
