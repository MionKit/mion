/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUndefined} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class UndefinedRunType implements RunType<TypeUndefined> {
    public readonly name = 'undefined';
    public readonly shouldEncodeJson = true;
    public readonly shouldDecodeJson = true;
    constructor(
        public readonly src: TypeUndefined,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `typeof ${varName} === 'undefined'`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'undefined') ${errorsName}.push({path: ${pathChain}, message: 'Expected to be undefined'})`;
    }
    getJsonEncodeCode(): string {
        return `null`;
    }
    getJsonDecodeCode(): string {
        return `undefined`;
    }
    getMockCode(varName: string): string {
        return `${varName} = undefined`;
    }
}
