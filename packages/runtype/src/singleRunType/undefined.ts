/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeUndefined} from '../_deepkit/src/reflection/type';
import type {RunType} from '../types';
import {SingleRunType} from '../baseRunTypes';
import {toLiteral} from '../utils';
import {jitNames} from '../constants';

export class UndefinedRunType extends SingleRunType<TypeUndefined> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;

    compileIsType(parents: RunType[], varName: string): string {
        return `typeof ${varName} === 'undefined'`;
    }
    compileTypeErrors(parents: RunType[], varName: string): string {
        return `if (typeof ${varName} !== 'undefined') ${jitNames.errors}.push({path: [...${jitNames.path}], expected: ${toLiteral(this.getName())}})`;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return `${varName} = null`;
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return `${varName} = undefined`;
    }
    compileJsonStringify(): string {
        return `null`;
    }
    mock(): undefined {
        return undefined;
    }
}
