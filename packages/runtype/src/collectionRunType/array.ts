/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '@deepkit/type';
import {RunType, RunTypeAccessor, RunTypeVisitor} from '../types';

export class ArrayRunType implements RunType<TypeArray> {
    private itemsRunType: RunType;
    public readonly shouldEncodeJson;
    public readonly shouldDecodeJson;
    public readonly name = 'arrayType';
    constructor(
        public readonly src: TypeArray,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor,
        public readonly nestLevel: number
    ) {
        this.itemsRunType = visitor(src.type, `${path}[]`, nestLevel + 1);
        this.shouldEncodeJson = this.itemsRunType.shouldEncodeJson;
        this.shouldDecodeJson = this.itemsRunType.shouldDecodeJson;
    }
    getValidateCode(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        return `Array.isArray(${varName}) && ${varName}.every((${itemName}) => (${this.itemsRunType.getValidateCode(itemName)}))`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, itemPath: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        const indexName = `indεx${this.nestLevel}`;
        const listItemPath = `${itemPath} + '.' + ${indexName}`;

        return (
            `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be an Array'});` +
            `else ${varName}.forEach((${itemName}, ${indexName}) => {${this.itemsRunType.getValidateCodeWithErrors(itemName, errorsName, listItemPath)}})`
        );
    }
    getJsonEncodeCode(varName: string): string {
        if (!this.shouldEncodeJson) return `${varName}`;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.getJsonEncodeCode(itemName)})`;
    }
    getJsonDecodeCode(varName: string): string {
        if (!this.shouldDecodeJson) return `${varName}`;
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.getJsonDecodeCode(itemName)})`;
    }
    getMockCode(varName: string): string {
        const itemName = `iτεm${this.nestLevel}`;
        return `${varName} = Array.from({length: Math.floor(Math.random() * 10)}, () => {
            let ${itemName};
            ${this.itemsRunType.getMockCode(itemName)}
            return ${itemName};
        })`;
    }
}
