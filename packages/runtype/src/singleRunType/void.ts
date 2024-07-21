/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeVoid} from '../_deepkit/src/reflection/type';
import {SingleRunType} from '../baseRunTypes';
import {toLiteral} from '../utils';

export class VoidRunType extends SingleRunType<TypeVoid> {
    public readonly slug = 'void';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `${varName} === undefined`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== undefined) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return `${varName} = undefined`;
    }
    JIT_jsonDecode(varName: string): string {
        return `${varName} = undefined`;
    }
    JIT_jsonStringify(): string {
        return 'undefined';
    }
    mock(): void {}
}
