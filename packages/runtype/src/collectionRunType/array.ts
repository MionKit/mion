/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, toLiteral} from '../utils';
import {random} from '../mock';

export class ArrayRunType implements RunType<TypeArray> {
    public readonly name: string;
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly itemsRunType: RunType;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeArray,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        this.itemsRunType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.itemsRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.itemsRunType.isJsonDecodeRequired;
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
    jsonEncodeJIT(varName: string, isStrict?: boolean): string {
        if (!isStrict && !this.isJsonEncodeRequired) return varName;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.jsonEncodeJIT(itemName, isStrict)})`;
    }
    jsonStringifyJIT(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        const itemsCode = `${varName}.map((${itemName}) => ${this.itemsRunType.jsonStringifyJIT(itemName)}).join(",")`;
        return `'[' + ${itemsCode} + ']'`;
    }
    jsonDecodeJIT(varName: string, isStrict?: boolean): string {
        if (!isStrict && !this.isJsonDecodeRequired) return varName;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.jsonDecodeJIT(itemName, isStrict)})`;
    }
    mock(length = random(0, 30), ...args: any[]): any[] {
        return Array.from({length}, () => this.itemsRunType.mock(...args));
    }
}
