/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeString} from '../_deepkit/src/reflection/type';
import {toLiteral} from '../utils';
import {mockString} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitUtilsVarNames} from '../jitUtils';

export class StringRunType extends SingleRunType<TypeString> {
    public readonly slug = 'string';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(varName: string): string {
        return `typeof ${varName} === 'string'`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'string') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(varName: string): string {
        return `${jitUtilsVarNames.asJSONString}(${varName})`;
    }
    mock(length: number, charSet: string): string {
        return mockString(length, charSet);
    }
}
