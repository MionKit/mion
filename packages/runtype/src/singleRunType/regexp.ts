/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeRegexp} from '@deepkit/type';
import {RunType, RunTypeVisitor, JitJsonEncoder} from '../types';

export class RegexpRunType implements RunType<TypeRegexp> {
    public readonly name = 'RegExp';
    public readonly shouldEncodeJson = true;
    public readonly shouldDecodeJson = true;
    constructor(
        public readonly src: TypeRegexp,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {}
    getValidateCode(varName: string): string {
        return `(${varName} instanceof RegExp)`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, itemPath: string): string {
        return `if (!(${varName} instanceof RegExp)) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a RegExp'})`;
    }
    getJsonEncodeCode(varName: string): string {
        return RegexpJitJsonEncoder.encodeToJson(varName);
    }
    getJsonDecodeCode(varName: string): string {
        return RegexpJitJsonEncoder.decodeFromJson(varName);
    }
    getMockCode(varName: string): string {
        const regExpList = `regExpList${this.nestLevel}`;
        return (
            `const ${regExpList} = [/example/, /abc/, /^a-zA-Z0-9/, /abc/i, /hello[0-9]/];` +
            `${varName} = ${regExpList}[Math.floor(Math.random() * ${regExpList}.length)]`
        );
    }
}

export const matchRegExp = /\/(.*)\/(.*)?/;
export const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const RegexpJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(varName: string): string {
        return `(function(){const parts = ${varName}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    encodeToJson(varName: string): string {
        return `(${varName}.toString())`;
    },
};
