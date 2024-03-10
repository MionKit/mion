/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeString} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {mockString} from '../mock';

export class StringRunType implements RunType<TypeString> {
    public readonly name = 'string';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeString,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'string'`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'string') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return varName;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    jsonStringifyJIT(varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    mock(length: number, charSet: string): string {
        return mockString(length, charSet);
    }
}
