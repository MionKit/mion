/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeAny, TypeUnknown} from '../_deepkit/src/reflection/type';
import {random} from '../mock';
import {toLiteral} from '../utils';
import {mockObjectList} from '../constants';
import {SingleRunType} from '../baseRunTypes';

export class ObjectRunType extends SingleRunType<TypeAny | TypeUnknown> {
    public readonly slug = 'object';
    public readonly isJsonEncodeRequired = false;
    public readonly isJsonDecodeRequired = false;

    compileIsType(varName: string): string {
        return `typeof ${varName} === 'object' && ${varName} !== null`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.compileIsType(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    compileJsonEncode(): string {
        return '';
    }
    compileJsonDecode(): string {
        return '';
    }
    compileJsonStringify(varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    mock(objectLis: object[] = mockObjectList): object {
        return objectLis[random(0, objectLis.length - 1)];
    }
}
