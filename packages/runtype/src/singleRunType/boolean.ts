/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBoolean} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {mockBoolean} from '../mock';

export class BooleanRunType implements RunType<TypeBoolean> {
    public readonly name = 'boolean';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        public readonly src: TypeBoolean,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'boolean'`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'boolean') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
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
    mock(): boolean {
        return mockBoolean();
    }
}
