/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeRegexp} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, MockOptions, TypeErrorsContext} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockRegExp} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(ctx: JitContext): string {
        return `(${ctx.args.value} instanceof RegExp)`;
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        return `if (!(${ctx.args.value} instanceof RegExp)) ${jitNames.errors}.push({path: ${getErrorPath(ctx.path)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(ctx: JitContext): string {
        return RegexpJitJsonEncoder.encodeToJson(ctx.args.value);
    }
    compileJsonDecode(ctx: JitContext): string {
        return RegexpJitJsonEncoder.decodeFromJson(ctx.args.value);
    }
    compileJsonStringify(ctx: JitContext): string {
        return RegexpJitJsonEncoder.stringify(ctx.args.value);
    }
    mock(ctx?: Pick<MockOptions, 'regexpList'>): RegExp {
        return mockRegExp(ctx?.regexpList);
    }
}

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const RegexpJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `${varName} = (function(){const parts = ${varName}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    encodeToJson(varName: string): string {
        return `${varName} = (${varName}.toString())`;
    },
    stringify(varName: string): string {
        return `JSON.stringify(${varName}.toString())`;
    },
};
