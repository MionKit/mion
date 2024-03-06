/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeBoolean} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class BooleanRunType implements RunType<TypeBoolean> {
    public readonly name = 'boolean';
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeBoolean,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `typeof ${varName} === 'boolean'`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'boolean') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    getJsonEncodeCode(varName: string): string {
        return varName;
    }
    getJsonDecodeCode(varName: string): string {
        return varName;
    }
    getMockCode(varName: string): string {
        return `${varName} = Math.random() < 0.5`;
    }
}
