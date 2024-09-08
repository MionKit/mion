/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeVoid} from '../_deepkit/src/reflection/type';
import type {JitContext, TypeErrorsContext} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getErrorPath, getExpected} from '../utils';
import {jitNames} from '../constants';

export class VoidRunType extends AtomicRunType<TypeVoid> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        return `${ctx.args.value} === undefined`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (${ctx.args.value} !== undefined) ${jitNames.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return `${ctx.args.value} = undefined`;
    }
    compileJsonDecode(ctx: JitContext): string {
        return `${ctx.args.value} = undefined`;
    }
    compileJsonStringify(): string {
        return 'undefined';
    }
    mock(): void {}
}
