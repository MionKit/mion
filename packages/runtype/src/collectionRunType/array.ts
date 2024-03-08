/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {addToPathChain, toLiteral} from '../utils';

export class ArrayRunType implements RunType<TypeArray> {
    public readonly name: string;
    public readonly shouldEncodeJson;
    public readonly shouldDecodeJson;
    public readonly itemsRunType: RunType;
    constructor(
        public readonly src: TypeArray,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.itemsRunType = visitor(src.type, nestLevel);
        this.shouldEncodeJson = this.itemsRunType.shouldEncodeJson;
        this.shouldDecodeJson = this.itemsRunType.shouldDecodeJson;
        this.name = `array<${this.itemsRunType.name}>`;
    }
    isTypeJIT(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        return `Array.isArray(${varName}) && ${varName}.every((${itemName}) => (${this.itemsRunType.isTypeJIT(itemName)}))`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathLiteral: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        const indexName = `indεx${this.nestLevel}`;
        const listItemPath = addToPathChain(pathLiteral, indexName, false);

        return (
            `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else ${varName}.forEach((${itemName}, ${indexName}) => {${this.itemsRunType.typeErrorsJIT(itemName, errorsName, listItemPath)}})`
        );
    }
    jsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeJson) return `${varName}`;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.jsonEncodeJIT(itemName)})`;
    }
    jsonStringifyJIT(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        const itemsCode = `${varName}.map((${itemName}) => ${this.itemsRunType.jsonStringifyJIT(itemName)}).join(",")`;
        return `'[' + ${itemsCode} + ']'`;
    }
    jsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeJson) return `${varName}`;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.jsonDecodeJIT(itemName)})`;
    }
    mockJIT(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName} = Array.from({length: Math.floor(Math.random() * 10)}, () => {
            let ${itemName};
            ${this.itemsRunType.mockJIT(itemName)}
            return ${itemName};
        })`;
    }
}
