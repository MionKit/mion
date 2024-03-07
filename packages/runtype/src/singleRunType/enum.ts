/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '@deepkit/type';
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
    isTypeJIT(varName: string): string {
        return this.src.values.map((v) => `${varName} === ${toLiteral(v)}`).join(' || ');
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.isTypeJIT(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        return varName;
    }
    jsonStringifyJIT(varName: string): string {
        if (this.src.indexType.kind === ReflectionKind.number) return varName;
        return `JSON.stringify(${varName})`;
    }
    jsonDecodeJIT(varName: string): string {
        return varName;
    }
    mockJIT(varName: string): string {
        const enumList = `εnumList${this.nestLevel}`;
        return (
            `const ${enumList} = [${this.src.values.map((v) => toLiteral(v)).join(', ')}];` +
            `${varName} = ${enumList}[Math.floor(Math.random() * ${enumList}.length)]`
        );
    }
}
