/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeString} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';

export class StringRunType implements RunType<TypeString> {
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeString,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `typeof ${varName} === 'string'`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, itemPath: string): string {
        return `if (typeof ${varName} !== 'string') ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a String'})`;
    }
    getJsonEncodeCode(varName: string): string {
        return `${varName}`;
    }
    getJsonDecodeCode(varName: string): string {
        return `${varName}`;
    }
    getMockCode(varName: string): string {
        return (
            `const ALPHABET = 'abcdefghijklmnopqrstuvwxyz 1234567890';` +
            `const length = Math.floor(Math.random() * 20);` +
            `${varName} = Array.from({length}, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')`
        );
    }
}
