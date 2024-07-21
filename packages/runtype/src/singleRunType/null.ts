/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNull} from '../_deepkit/src/reflection/type';
import {SingleRunType} from '../baseRunTypes';
import {toLiteral} from '../utils';

export class NullRunType extends SingleRunType<TypeNull> {
    public readonly slug = 'null';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `${varName} === null`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== null) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    JIT_jsonEncode(): string {
        return '';
    }
    JIT_jsonDecode(): string {
        return '';
    }
    JIT_jsonStringify(varName: string): string {
        return varName;
    }
    mock(): null {
        return null;
    }
}
