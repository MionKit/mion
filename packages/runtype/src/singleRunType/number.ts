/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNumber} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class NumberRunType implements RunType<TypeNumber> {
    public readonly name = 'number';
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeNumber,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'number' && Number.isFinite(${varName})`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if(!(${this.isTypeJIT(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return varName;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    mockJIT(varName: string): string {
        return `${varName} = Math.floor(Math.random() * 10000)`;
    }
}
