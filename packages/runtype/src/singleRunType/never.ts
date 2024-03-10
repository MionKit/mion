/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNever} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';

export class NeverRunType extends BaseRunType<TypeNever> {
    public readonly name = 'never';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    JIT_isType(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    JIT_typeErrors(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    JIT_jsonEncode(): string {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    JIT_jsonDecode(): string {
        throw new Error('Never type cannot be decoded from JSON.');
    }
    JIT_jsonStringify(): string {
        throw new Error('Never type cannot be stringified.');
    }
    mock() {
        throw new Error('Never type cannot be mocked.');
    }
}
