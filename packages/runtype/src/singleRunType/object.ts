/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAny, TypeUnknown} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {random} from '../mock';
import {toLiteral} from '../utils';
import {mockObjectList} from '../constants';

export class ObjectRunType implements RunType<TypeAny | TypeUnknown> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;
    constructor(
        public readonly src: TypeAny | TypeUnknown,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number,
        public readonly name = 'object'
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'object' && ${varName} !== null`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.isTypeJIT(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return varName;
    }
    jsonStringifyJIT(varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    mock(objectLis: object[] = mockObjectList): object {
        return objectLis[random(0, objectLis.length - 1)];
    }
}
