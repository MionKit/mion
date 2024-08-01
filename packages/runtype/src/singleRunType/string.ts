/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeString} from '../_deepkit/src/reflection/type';
import {toLiteral, pathChainToLiteral} from '../utils';
import {mockString} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitVarNames} from '../jitUtils';
import {JitErrorPath} from '../types';

export class StringRunType extends SingleRunType<TypeString> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(varName: string): string {
        return `typeof ${varName} === 'string'`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return `if (typeof ${varName} !== 'string') ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(varName: string): string {
        return `${jitVarNames.asJSONString}(${varName})`;
    }
    mock(length: number, charSet: string): string {
        return mockString(length, charSet);
    }
}
