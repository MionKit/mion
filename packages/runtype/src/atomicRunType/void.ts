/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeVoid} from '../_deepkit/src/reflection/type';
import type {JitContext, TypeErrorsContext} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJitErrorPath, getExpected} from '../utils';

export class VoidRunType extends AtomicRunType<TypeVoid> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        return `${ctx.args.vλl} === undefined`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (${ctx.args.vλl} !== undefined) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return `${ctx.args.vλl} = undefined`;
    }
    compileJsonDecode(ctx: JitContext): string {
        return `${ctx.args.vλl} = undefined`;
    }
    compileJsonStringify(): string {
        return 'undefined';
    }
    mock(): void {}
}
