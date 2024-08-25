/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeString} from '../_deepkit/src/reflection/type';
import type {RunType} from '../types';
import {toLiteral} from '../utils';
import {mockString} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class StringRunType extends SingleRunType<TypeString> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(parents: RunType[], varName: string): string {
        return `typeof ${varName} === 'string'`;
    }
    compileTypeErrors(parents: RunType[], varName: string): string {
        return `if (typeof ${varName} !== 'string') ${jitNames.errors}.push({path: [...${jitNames.path}], expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        return `${jitNames.utils}.asJSONString(${varName})`;
    }
    mock(length: number, charSet: string): string {
        return mockString(length, charSet);
    }
}
