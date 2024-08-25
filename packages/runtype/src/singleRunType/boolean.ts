/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeBoolean} from '../_deepkit/src/reflection/type';
import type {RunType} from '../types';
import {toLiteral} from '../utils';
import {mockBoolean} from '../mock';
import {SingleRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class BooleanRunType extends SingleRunType<TypeBoolean> {
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(parents: RunType[], varName: string): string {
        return `typeof ${varName} === 'boolean'`;
    }
    compileTypeErrors(parents: RunType[], varName: string): string {
        return `if (typeof ${varName} !== 'boolean') ${jitNames.errors}.push({path: [...${jitNames.path}], expected: ${toLiteral(this.getName())}})`;
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
    mock(): boolean {
        return mockBoolean();
    }
}
