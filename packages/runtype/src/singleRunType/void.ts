/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeVoid} from '../_deepkit/src/reflection/type';
import type {RunType} from '../types';
import {SingleRunType} from '../baseRunTypes';
import {getErrorPath, getExpected} from '../utils';
import {jitNames} from '../constants';

export class VoidRunType extends SingleRunType<TypeVoid> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(parents: RunType[], varName: string): string {
        return `${varName} === undefined`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if (${varName} !== undefined) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return `${varName} = undefined`;
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return `${varName} = undefined`;
    }
    compileJsonStringify(): string {
        return 'undefined';
    }
    mock(): void {}
}
