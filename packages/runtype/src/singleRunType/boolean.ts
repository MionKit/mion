/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBoolean} from '../_deepkit/src/reflection/type';
import {toLiteral} from '../utils';
import {mockBoolean} from '../mock';
import {SingleRunType} from '../baseRunTypes';

export class BooleanRunType extends SingleRunType<TypeBoolean> {
    public readonly slug = 'boolean';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `typeof ${varName} === 'boolean'`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'boolean') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
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
    mock(): boolean {
        return mockBoolean();
    }
}
