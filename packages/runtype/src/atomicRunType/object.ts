/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import type {RunType} from '../types';
import {random} from '../mock';
import {getErrorPath, getExpected} from '../utils';
import {jitNames, mockObjectList} from '../constants';
import {AtomicRunType} from '../baseRunTypes';

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(parents: RunType[], varName: string): string {
        return `(typeof ${varName} === 'object' && ${varName} !== null)`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return `if (!(${this.compileIsType(parents, varName)})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    mock(objectLis: object[] = mockObjectList): object {
        return objectLis[random(0, objectLis.length - 1)];
    }
}
