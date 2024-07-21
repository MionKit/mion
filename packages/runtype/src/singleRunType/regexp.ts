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
import {SingleRunType} from '../baseRunTypes';

export class RegexpRunType extends SingleRunType<TypeRegexp> {
    public readonly slug = 'regexp';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(varName: string): string {
        return `(${varName} instanceof RegExp)`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${varName} instanceof RegExp)) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    compileJsonEncode(varName: string): string {
        return RegexpJitJsonEncoder.encodeToJson(varName);
    }
    compileJsonDecode(varName: string): string {
        return RegexpJitJsonEncoder.decodeFromJson(varName);
    }
    compileJsonStringify(varName: string): string {
        return RegexpJitJsonEncoder.stringify(varName);
    }
    mock(list?: RegExp[]): RegExp {
        return mockRegExp(list);
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
