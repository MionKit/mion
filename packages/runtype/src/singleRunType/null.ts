/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNull} from '../_deepkit/src/reflection/type';
import type {RunType} from '../types';
import {SingleRunType} from '../baseRunTypes';
import {toLiteral} from '../utils';
import {jitNames} from '../constants';

export class NullRunType extends SingleRunType<TypeNull> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(parents: RunType[], varName: string): string {
        return `${varName} === null`;
    }
    compileTypeErrors(parents: RunType[], varName: string): string {
        return `if (${varName} !== null) ${jitNames.errors}.push({path: [...${jitNames.path}], expected: ${toLiteral(this.getName())}})`;
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
    mock(): null {
        return null;
    }
}
