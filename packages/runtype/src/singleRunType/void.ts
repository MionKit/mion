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

    compileIsType(varName: string): string {
        return `${varName} === undefined`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== undefined) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    compileJsonEncode(varName: string): string {
        return `${varName} = undefined`;
    }
    compileJsonDecode(varName: string): string {
        return `${varName} = undefined`;
    }
    compileJsonStringify(): string {
        return 'undefined';
    }
    mock(): void {}
}
