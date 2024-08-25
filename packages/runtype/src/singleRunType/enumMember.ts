/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeEnum} from '../_deepkit/src/reflection/type';
import {SingleRunType} from '../baseRunTypes';

export class EnumMemberRunType extends SingleRunType<TypeEnum> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(): string {
        throw new Error('Enum member operations are not supported');
    }
    compileTypeErrors(): string {
        throw new Error('Enum member operations are not supported');
    }
    compileJsonEncode(): string {
        throw new Error('Enum member operations are not supported');
    }
    compileJsonDecode(): string {
        throw new Error('Enum member operations are not supported');
    }
    compileJsonStringify(): string {
        throw new Error('Enum member operations are not supported');
    }
    mock() {
        throw new Error('Enum member operations are not supported');
    }
}
