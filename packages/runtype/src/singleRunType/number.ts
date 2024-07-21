/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNumber} from '../_deepkit/src/reflection/type';
import {toLiteral} from '../utils';
import {mockNumber} from '../mock';
import {SingleRunType} from '../baseRunTypes';

export class NumberRunType extends SingleRunType<TypeNumber> {
    public readonly slug = 'number';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(varName: string): string {
        return `typeof ${varName} === 'number' && Number.isFinite(${varName})`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if(!(${this.JIT_isType(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
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
    mock(min?: number, max?: number): number {
        return mockNumber(min, max);
    }
}
