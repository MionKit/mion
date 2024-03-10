/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNull} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {toLiteral} from '../utils';

export class NullRunType extends BaseRunType<TypeNull> {
    public readonly name = 'null';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `${varName} === null`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== null) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return varName;
    }
    JIT_jsonDecode(varName: string): string {
        return varName;
    }
    JIT_jsonStringify(varName: string): string {
        return varName;
    }
    mock(): null {
        return null;
    }
}
