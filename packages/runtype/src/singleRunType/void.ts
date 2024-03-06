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
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeVoid,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `${varName} === undefined`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== undefined) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    getJsonEncodeCode(): string {
        throw new Error('void can not be encoded to json.');
    }
    getJsonDecodeCode(): string {
        throw new Error('void can not be decoded from json.');
    }
    getMockCode(): string {
        return `void 0`;
    }
}
