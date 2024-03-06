/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNull} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class NullRunType implements RunType<TypeNull> {
    public readonly name = 'null';
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeNull,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `${varName} === null`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (${varName} !== null) ${errorsName}.push({path: ${pathChain}, message: 'Expected to be null'})`;
    }
    getJsonEncodeCode(varName: string): string {
        return varName;
    }
    getJsonDecodeCode(varName: string): string {
        return varName;
    }
    getMockCode(varName: string): string {
        return `${varName} = null`;
    }
}
