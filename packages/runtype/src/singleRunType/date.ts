/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeClass} from '../_deepkit/src/reflection/type';
import {JitJsonEncoder, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {mockDate} from '../mock';

export class DateRunType implements RunType<TypeClass> {
    public readonly name = 'date';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = true;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeClass,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {}
    isTypeJIT(varName: string): string {
        return `${varName} instanceof Date && !isNaN(${varName}.getTime())`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.isTypeJIT(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return DateJitJsonENcoder.encodeToJson(varName);
    }
    jsonStringifyJIT(varName: string): string {
        return DateJitJsonENcoder.stringify(varName);
    }
    jsonDecodeJIT(varName: string): string {
        return DateJitJsonENcoder.decodeFromJson(varName);
    }
    mock(minDate?: Date, maxDate?: Date): Date {
        return mockDate(minDate, maxDate);
    }
}

export const DateJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `new Date(${varName})`;
    },
    encodeToJson(varName: string): string {
        return `${varName}`;
    },
    stringify(varName: string): string {
        return `'"'+${varName}.toJSON()+'"'`;
    },
};
