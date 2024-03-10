/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNull} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class NullRunType implements RunType<TypeNull> {
    public readonly name = 'null';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeNull,
        public readonly nestLevel: number
    ) {}
    isTypeJIT(varName: string): string {
        return `${varName} === null`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== null) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return varName;
    }
    jsonStringifyJIT(varName: string): string {
        return varName;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    mock(): null {
        return null;
    }
}
