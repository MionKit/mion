/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUndefined} from '../_deepkit/src/reflection/type';
import {SingleRunType} from '../baseRunTypes';
import {JitErrorPath} from '../types';
import {toLiteral, pathChainToLiteral} from '../utils';

export class UndefinedRunType extends SingleRunType<TypeUndefined> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(varName: string): string {
        return `typeof ${varName} === 'undefined'`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return `if (typeof ${varName} !== 'undefined') ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(varName: string): string {
        return `${varName} = null`;
    }
    compileJsonDecode(varName: string): string {
        return `${varName} = undefined`;
    }
    compileJsonStringify(): string {
        return `null`;
    }
    mock(): undefined {
        return undefined;
    }
}
