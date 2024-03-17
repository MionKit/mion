/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeClass} from '../_deepkit/src/reflection/type';
import {JitJsonEncoder} from '../types';
import {toLiteral} from '../utils';
import {mockDate} from '../mock';
import {BaseRunType} from '../baseRunType';

export class DateRunType extends BaseRunType<TypeClass> {
    public readonly name = 'date';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = true;

    JIT_isType(varName: string): string {
        return `${varName} instanceof Date && !isNaN(${varName}.getTime())`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.JIT_isType(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        return DateJitJsonENcoder.encodeToJson(varName);
    }
    JIT_jsonDecode(varName: string): string {
        return DateJitJsonENcoder.decodeFromJson(varName);
    }
    JIT_jsonStringify(varName: string): string {
        return DateJitJsonENcoder.stringify(varName);
    }
    mock(minDate?: Date, maxDate?: Date): Date {
        return mockDate(minDate, maxDate);
    }
}

export const DateJitJsonENcoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `${varName} = new Date(${varName})`;
    },
    encodeToJson(): string {
        return ``;
    },
    stringify(varName: string): string {
        return `'"'+${varName}.toJSON()+'"'`;
    },
};
