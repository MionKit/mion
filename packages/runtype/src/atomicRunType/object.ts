/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import type {JitContext, MockOptions, TypeErrorsContext} from '../types';
import {random} from '../mock';
import {getErrorPath, getExpected} from '../utils';
import {mockObjectList} from '../constants';
import {AtomicRunType} from '../baseRunTypes';

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(ctx: JitContext): string {
        return `(typeof ${ctx.args.value} === 'object' && ${ctx.args.value} !== null)`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (!(${this.compileIsType(ctx)})) ${ctx.args.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(ctx: JitContext): string {
        return `JSON.stringify(${ctx.args.value})`;
    }
    mock(ctx?: Pick<MockOptions, 'objectList'>): object {
        const objectList = ctx?.objectList || mockObjectList;
        return objectList[random(0, objectList.length - 1)];
    }
}
