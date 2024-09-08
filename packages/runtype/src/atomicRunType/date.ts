/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockContext, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockDate} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class DateRunType extends AtomicRunType<TypeClass> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `(${ctx.args.vλl} instanceof Date && !isNaN(${ctx.args.vλl}.getTime()))`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (!(${this.compileIsType(ctx)})) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return DateJitJsonENcoder.encodeToJson(ctx.args.vλl);
    }
    compileJsonDecode(ctx: JitContext): string {
        return DateJitJsonENcoder.decodeFromJson(ctx.args.vλl);
    }
    compileJsonStringify(ctx: JitContext): string {
        return DateJitJsonENcoder.stringify(ctx.args.vλl);
    }
    mock(ctx?: Pick<MockContext, 'minDate' | 'maxDate'>): Date {
        return mockDate(ctx?.minDate, ctx?.maxDate);
    }
    getJitId(): string {
        return 'date';
    }
}

export const DateJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = new Date(${vλl})`;
    },
    encodeToJson(): string {
        return ``;
    },
    stringify(vλl: string): string {
        return `'"'+${vλl}.toJSON()+'"'`;
    },
};
