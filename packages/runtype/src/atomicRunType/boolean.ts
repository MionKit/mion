/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeBoolean} from '../_deepkit/src/reflection/type';
import type {JitContext, TypeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockBoolean} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        return `typeof ${ctx.args.value} === 'boolean'`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (typeof ${ctx.args.value} !== 'boolean') ${ctx.args.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(ctx: JitContext): string {
        return ctx.args.value;
    }
    mock(): boolean {
        return mockBoolean();
    }
}
