/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeClass} from '../_deepkit/src/reflection/type';
import {JitErrorPath, JitJsonEncoder} from '../types';
import {toLiteral, pathChainToLiteral} from '../utils';
import {mockDate} from '../mock';
import {SingleRunType} from '../baseRunTypes';

export class DateRunType extends SingleRunType<TypeClass> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = true;

    compileIsType(varName: string): string {
        return `${varName} instanceof Date && !isNaN(${varName}.getTime())`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return `if (!(${this.compileIsType(varName)})) ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(varName: string): string {
        return DateJitJsonENcoder.encodeToJson(varName);
    }
    compileJsonDecode(varName: string): string {
        return DateJitJsonENcoder.decodeFromJson(varName);
    }
    compileJsonStringify(varName: string): string {
        return DateJitJsonENcoder.stringify(varName);
    }
    mock(minDate?: Date, maxDate?: Date): Date {
        return mockDate(minDate, maxDate);
    }
    getJitId(): string {
        return 'date';
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
