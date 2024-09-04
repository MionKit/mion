/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeClass} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, RunType} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockDate} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class DateRunType extends AtomicRunType<TypeClass> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = true;

    compileIsType(parents: RunType[], varName: string): string {
        return `(${varName} instanceof Date && !isNaN(${varName}.getTime()))`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if (!(${this.compileIsType(parents, varName)})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return DateJitJsonENcoder.encodeToJson(varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return DateJitJsonENcoder.decodeFromJson(varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
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
