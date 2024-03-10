/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeString} from '../_deepkit/src/reflection/type';
import {toLiteral} from '../utils';
import {mockString} from '../mock';
import {BaseRunType} from '../baseRunType';

export class StringRunType extends BaseRunType<TypeString> {
    public readonly name = 'string';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `typeof ${varName} === 'string'`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'string') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return varName;
    }
    JIT_jsonDecode(varName: string): string {
        return varName;
    }
    JIT_jsonStringify(varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    mock(length: number, charSet: string): string {
        return mockString(length, charSet);
    }
}
