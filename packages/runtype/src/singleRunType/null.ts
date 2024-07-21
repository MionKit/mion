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

    compileIsType(varName: string): string {
        return `${varName} === null`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== null) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(varName: string): string {
        return varName;
    }
    mock(): null {
        return null;
    }
}
