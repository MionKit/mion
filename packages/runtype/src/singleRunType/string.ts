/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeString} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class StringRunType implements RunType<TypeString> {
    public readonly name = 'string';
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeString,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    isTypeJIT(varName: string): string {
        return `typeof ${varName} === 'string'`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (typeof ${varName} !== 'string') ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return varName;
    }
    jsonStringifyJIT(varName: string): string {
        return `JSON.stringify(${varName})`;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    mockJIT(varName: string): string {
        const alpha = `alpha${this.nestLevel}`;
        const length = `length${this.nestLevel}`;
        return (
            `const ${alpha} = 'abcdefghijklmnopqrstuvwxyz 1234567890';` +
            `const ${length} = Math.floor(Math.random() * 20);` +
            `${varName} = Array.from({length: ${length}}, () => ${alpha}[Math.floor(Math.random() * ${alpha}.length)]).join('')`
        );
    }
}
