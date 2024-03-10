/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeVoid} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class VoidRunType implements RunType<TypeVoid> {
    public readonly name = 'void';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeVoid,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {}
    isTypeJIT(varName: string): string {
        return `${varName} === undefined`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== undefined) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(): string {
        throw new Error('void can not be encoded to json.');
    }
    jsonDecodeJIT(): string {
        throw new Error('void can not be decoded from json.');
    }
    jsonStringifyJIT(): string {
        throw new Error('void can not be stringified.');
    }
    mock(): void {}
}
