/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeVoid} from '../_deepkit/src/reflection/type';
import {SingleRunType} from '../baseRunTypes';
import {JitErrorPath} from '../types';
import {toLiteral, pathChainToLiteral} from '../utils';

export class VoidRunType extends SingleRunType<TypeVoid> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(varName: string): string {
        return `${varName} === undefined`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return `if (${varName} !== undefined) ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}})`;
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
