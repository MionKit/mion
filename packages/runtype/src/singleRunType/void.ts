/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeVoid} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class VoidRunType implements RunType<TypeVoid> {
    public readonly name = 'void';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        public readonly src: TypeVoid,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
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
    jsonStringifyJIT(): string {
        throw new Error('void can not be stringified.');
    }
    jsonDecodeJIT(): string {
        throw new Error('void can not be decoded from json.');
    }
    mock(): void {}
}
