/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBoolean} from '../_deepkit/src/reflection/type';
import {toLiteral} from '../utils';
import {mockBoolean} from '../mock';
import {BaseRunType} from '../baseRunType';

export class BooleanRunType extends BaseRunType<TypeBoolean> {
    public readonly name = 'boolean';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `typeof ${varName} === 'boolean'`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'boolean') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
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
    mock(): boolean {
        return mockBoolean();
    }
}
