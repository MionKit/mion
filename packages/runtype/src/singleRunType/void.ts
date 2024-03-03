/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeVoid} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';

export class VoidRunType implements RunType<TypeVoid> {
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeVoid,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor
    ) {}
    getValidateCode(varName: string): string {
        return `${varName} === undefined`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, path = this.path): string {
        return `if (${varName} !== undefined) ${errorsName}.push({path: ${path || "'.'"}, message: 'Expected to be void'})`;
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
