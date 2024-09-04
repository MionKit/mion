/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNever} from '../_deepkit/src/reflection/type';
import {AtomicRunType} from '../baseRunTypes';

export class NeverRunType extends AtomicRunType<TypeNever> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    compileTypeErrors(): string {
        throw new Error('Never type cannot exist at runtime.');
    }
    compileJsonEncode(): string {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    compileJsonDecode(): string {
        throw new Error('Never type cannot be decoded from JSON.');
    }
    compileJsonStringify(): string {
        throw new Error('Never type cannot be stringified.');
    }
    mock() {
        throw new Error('Never type cannot be mocked.');
    }
}
