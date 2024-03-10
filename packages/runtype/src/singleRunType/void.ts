/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeVoid} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {toLiteral} from '../utils';

export class VoidRunType extends BaseRunType<TypeVoid> {
    public readonly name = 'void';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `${varName} === undefined`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== undefined) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(): string {
        throw new Error('void can not be encoded to json.');
    }
    JIT_jsonDecode(): string {
        throw new Error('void can not be decoded from json.');
    }
    JIT_jsonStringify(): string {
        throw new Error('void can not be stringified.');
    }
    mock(): void {}
}
