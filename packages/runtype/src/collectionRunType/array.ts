/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {random} from '../mock';
import {BaseRunType} from '../baseRunType';

export class ArrayRunType extends BaseRunType<TypeArray> {
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
        super(visitor, src, nestLevel, opts);
        this.itemsRunType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.itemsRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.itemsRunType.isJsonDecodeRequired;
        this.name = `array<${this.itemsRunType.name}>`;
    }
    JIT_isType(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        return `Array.isArray(${varName}) && ${varName}.every((${itemName}) => (${this.itemsRunType.JIT_isType(itemName)}))`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathLiteral: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        const indexName = `indεx${this.nestLevel}`;
        const listItemPath = addToPathChain(pathLiteral, indexName, false);

        return (
            `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else ${varName}.forEach((${itemName}, ${indexName}) => {${this.itemsRunType.JIT_typeErrors(itemName, errorsName, listItemPath)}})`
        );
    }
    JIT_jsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return varName;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.JIT_jsonEncode(itemName)})`;
    }
    JIT_jsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return varName;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.JIT_jsonDecode(itemName)})`;
    }
    JIT_jsonStringify(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        const itemsCode = `${varName}.map((${itemName}) => ${this.itemsRunType.JIT_jsonStringify(itemName)}).join(",")`;
        return `'[' + ${itemsCode} + ']'`;
    }
    mock(length = random(0, 30), ...args: any[]): any[] {
        return Array.from({length}, () => this.itemsRunType.mock(...args));
    }
}
