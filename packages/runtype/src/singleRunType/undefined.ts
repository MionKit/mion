/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUndefined} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {toLiteral} from '../utils';

export class UndefinedRunType extends BaseRunType<TypeUndefined> {
    public readonly name = 'undefined';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    JIT_isType(varName: string): string {
        return `typeof ${varName} === 'undefined'`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'undefined') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return `${varName} = null`;
    }
    JIT_jsonDecode(varName: string): string {
        return `${varName} = undefined`;
    }
    JIT_jsonStringify(): string {
        return `null`;
    }
    mock(): undefined {
        return undefined;
    }
}
