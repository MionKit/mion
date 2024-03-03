/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNull} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';

export class NullRunType implements RunType<TypeNull> {
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeNull,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `${varName} === null`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, itemPath: string): string {
        return `if (${varName} !== null) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be null'})`;
    }
    getJsonEncodeCode(varName: string): string {
        return `${varName}`;
    }
    getJsonDecodeCode(varName: string): string {
        return `${varName}`;
    }
    getMockCode(varName: string): string {
        return `${varName} = null`;
    }
}
