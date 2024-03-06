/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeEnum} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class EnumRunType implements RunType<TypeEnum> {
    public readonly name: string;
    public readonly shouldEncodeJson = false;
    public readonly shouldDecodeJson = false;
    constructor(
        public readonly src: TypeEnum,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.name = `enum<${src.values.map((v) => v).join(', ')}>`;
    }
    getValidateCode(varName: string): string {
        return this.src.values.map((v) => `${varName} === ${toLiteral(v)}`).join(' || ');
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.getValidateCode(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    getJsonEncodeCode(varName: string): string {
        return varName;
    }
    getJsonDecodeCode(varName: string): string {
        return varName;
    }
    getMockCode(varName: string): string {
        const enumList = `εnumList${this.nestLevel}`;
        return (
            `const ${enumList} = [${this.src.values.map((v) => toLiteral(v)).join(', ')}];` +
            `${varName} = ${enumList}[Math.floor(Math.random() * ${enumList}.length)]`
        );
    }
}
