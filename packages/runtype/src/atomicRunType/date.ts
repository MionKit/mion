/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockOptions, TypeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockDate} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class DateRunType extends AtomicRunType<TypeClass> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `(${ctx.args.value} instanceof Date && !isNaN(${ctx.args.value}.getTime()))`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (!(${this.compileIsType(ctx)})) ${ctx.args.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return DateJitJsonENcoder.encodeToJson(ctx.args.value);
    }
    compileJsonDecode(ctx: JitContext): string {
        return DateJitJsonENcoder.decodeFromJson(ctx.args.value);
    }
    compileJsonStringify(ctx: JitContext): string {
        return DateJitJsonENcoder.stringify(ctx.args.value);
    }
    mock(ctx?: Pick<MockOptions, 'minDate' | 'maxDate'>): Date {
        return mockDate(ctx?.minDate, ctx?.maxDate);
    }
    getJitId(): string {
        return 'date';
    }
}

export const DateJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `${varName} = new Date(${varName})`;
    },
    encodeToJson(): string {
        return ``;
    },
    stringify(varName: string): string {
        return `'"'+${varName}.toJSON()+'"'`;
    },
};
