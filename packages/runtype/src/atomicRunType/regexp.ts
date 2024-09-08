/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeRegexp} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockContext, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockRegExp} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `(${ctx.args.vλl} instanceof RegExp)`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (!(${ctx.args.vλl} instanceof RegExp)) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return RegexpJitJsonEncoder.encodeToJson(ctx.args.vλl);
    }
    compileJsonDecode(ctx: JitContext): string {
        return RegexpJitJsonEncoder.decodeFromJson(ctx.args.vλl);
    }
    compileJsonStringify(ctx: JitContext): string {
        return RegexpJitJsonEncoder.stringify(ctx.args.vλl);
    }
    mock(ctx?: Pick<MockContext, 'regexpList'>): RegExp {
        return mockRegExp(ctx?.regexpList);
    }
}

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const RegexpJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = (function(){const parts = ${vλl}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl} = (${vλl}.toString())`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify(${vλl}.toString())`;
    },
};
