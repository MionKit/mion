/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeString} from '../_deepkit/src/reflection/type';
import type {JitContext, MockOptions, TypeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockString, random} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames, stringCharSet} from '../constants';

export class StringRunType extends AtomicRunType<TypeString> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        return `typeof ${ctx.args.value} === 'string'`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (typeof ${ctx.args.value} !== 'string') ${jitNames.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(ctx: JitContext): string {
        return `${jitNames.utils}.asJSONString(${ctx.args.value})`;
    }
    mock(ctx?: Pick<MockOptions, 'stringLength' | 'stringCharSet'>): string {
        const length = ctx?.stringLength || random(1, 500);
        const charSet = ctx?.stringCharSet || stringCharSet;
        return mockString(length, charSet);
    }
}
