/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeClass} from '@deepkit/type';
import {JitJsonEncoder, RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class DateRunType implements RunType<TypeClass> {
    public readonly name = 'date';
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = true;
    constructor(
        public readonly src: TypeClass,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
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
    mockJIT(varName: string): string {
        return `${varName} = new Date(+(new Date()) - Math.floor(Math.random() * 10000000000))`;
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
