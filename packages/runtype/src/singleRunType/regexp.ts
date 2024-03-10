/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeRegexp} from '../_deepkit/src/reflection/type';
import {JitJsonEncoder} from '../types';
import {toLiteral} from '../utils';
import {mockRegExp} from '../mock';
import {BaseRunType} from '../baseRunType';

export class RegexpRunType extends BaseRunType<TypeRegexp> {
    public readonly name = 'regexp';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    JIT_isType(varName: string): string {
        return `(${varName} instanceof RegExp)`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${varName} instanceof RegExp)) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return RegexpJitJsonEncoder.encodeToJson(varName);
    }
    JIT_jsonDecode(varName: string): string {
        return RegexpJitJsonEncoder.decodeFromJson(varName);
    }
    JIT_jsonStringify(varName: string): string {
        return RegexpJitJsonEncoder.stringify(varName);
    }
    mock(list?: RegExp[]): RegExp {
        return mockRegExp(list);
    }
}

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const RegexpJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `(function(){const parts = ${varName}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    encodeToJson(varName: string): string {
        return `(${varName}.toString())`;
    },
    stringify(varName: string): string {
        return `JSON.stringify(${varName}.toString())`;
    },
};
