/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBoolean} from '../_deepkit/src/reflection/type';
import {toLiteral, pathChainToLiteral} from '../utils';
import {mockBoolean} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {JitErrorPath} from '../types';

export class BooleanRunType extends SingleRunType<TypeBoolean> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(varName: string): string {
        return `typeof ${varName} === 'boolean'`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return `if (typeof ${varName} !== 'boolean') ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}})`;
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
    mock(): boolean {
        return mockBoolean();
    }
}
