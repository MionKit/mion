/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeEnum} from '../_deepkit/src/reflection/type';
import {SingleRunType} from '../baseRunTypes';

export class EnumMemberRunType extends SingleRunType<TypeEnum> {
    public readonly slug = 'enumMember';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(): string {
        throw new Error('Enum member operations are not supported');
    }
    JIT_typeErrors(): string {
        throw new Error('Enum member operations are not supported');
    }
    JIT_jsonEncode(): string {
        throw new Error('Enum member operations are not supported');
    }
    JIT_jsonDecode(): string {
        throw new Error('Enum member operations are not supported');
    }
    JIT_jsonStringify(): string {
        throw new Error('Enum member operations are not supported');
    }
    mock() {
        throw new Error('Enum member operations are not supported');
    }
}
