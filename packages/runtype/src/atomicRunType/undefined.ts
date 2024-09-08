/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeUndefined} from '../_deepkit/src/reflection/type';
import type {JitContext, TypeErrorsContext} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getErrorPath, getExpected} from '../utils';
import {jitNames} from '../constants';

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `typeof ${ctx.args.value} === 'undefined'`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (typeof ${ctx.args.value} !== 'undefined') ${jitNames.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return `${ctx.args.value} = null`;
    }
    compileJsonDecode(ctx: JitContext): string {
        return `${ctx.args.value} = undefined`;
    }
    compileJsonStringify(): string {
        return `null`;
    }
    mock(): undefined {
        return undefined;
    }
}
