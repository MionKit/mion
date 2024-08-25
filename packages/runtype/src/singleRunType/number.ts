/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNumber} from '../_deepkit/src/reflection/type';
import type {RunType} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockNumber} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class NumberRunType extends SingleRunType<TypeNumber> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(parents: RunType[], varName: string): string {
        return `(typeof ${varName} === 'number' && Number.isFinite(${varName}))`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if(!(${this.compileIsType(parents, varName)})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        return varName;
    }
    mock(min?: number, max?: number): number {
        return mockNumber(min, max);
    }
}
