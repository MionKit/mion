/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeRegexp} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, RunType} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockRegExp} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class RegexpRunType extends SingleRunType<TypeRegexp> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(parents: RunType[], varName: string): string {
        return `(${varName} instanceof RegExp)`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if (!(${varName} instanceof RegExp)) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return RegexpJitJsonEncoder.encodeToJson(varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return RegexpJitJsonEncoder.decodeFromJson(varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
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
