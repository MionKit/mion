/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUndefined} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';

export class UndefinedRunType implements RunType<TypeUndefined> {
    public readonly shouldEncodeJson = true;
    public readonly shouldDecodeJson = true;
    constructor(
        public readonly src: TypeUndefined,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor
    ) {}
    getValidateCode(varName: string): string {
        return `typeof ${varName} === 'undefined'`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, path = this.path): string {
        return `if (typeof ${varName} !== 'undefined') ${errorsName}.push({path: ${path || "'.'"}, message: 'Expected to be undefined'})`;
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
