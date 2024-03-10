/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUndefined} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class UndefinedRunType implements RunType<TypeUndefined> {
    public readonly name = 'undefined';
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeUndefined,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'undefined'`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'undefined') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(): string {
        return `null`;
    }
    jsonStringifyJIT(): string {
        return `null`;
    }
    jsonDecodeJIT(): string {
        return `undefined`;
    }
    mock(): undefined {
        return undefined;
    }
}
