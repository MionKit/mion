/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeNumber} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {mockNumber} from '../mock';

export class NumberRunType implements RunType<TypeNumber> {
    public readonly name = 'number';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
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
    jsonStringifyJIT(varName: string): string {
        return varName;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    mock(min?: number, max?: number): number {
        return mockNumber(min, max);
    }
}
