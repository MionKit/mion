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
    constructor(
        public readonly src: TypeArray,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor
    ) {
        this.itemsRunType = visitor(src.type, `${path}[]`);
        this.shouldEncodeJson = this.itemsRunType.shouldEncodeJson;
        this.shouldDecodeJson = this.itemsRunType.shouldDecodeJson;
    }
    getValidateCode(varName: string): string {
        const itemName = `${varName}Item`;
        return `Array.isArray(${varName}) && ${varName}.every((${itemName}) => (${this.itemsRunType.getValidateCode(itemName)}))`;
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, path = this.path): string {
        const itemName = `${varName}Item`;
        const itemPath = path === '' ? 'index' : `${path} + '.' + index`;
        return (
            `Array.isArray(${varName} ? '' : ${errorsName} = 'Expected to be an Array';` +
            `${varName}.forEach((${itemName}, index) => {${this.itemsRunType.getValidateCodeWithErrors(itemName, errorsName, itemPath)}})`
        );
    }
    getJsonEncodeCode(varName: string): string {
        if (!this.shouldEncodeJson) return `${varName}`;
        const itemName = `${varName}Item`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.getJsonEncodeCode(itemName)})`;
    }
    getJsonDecodeCode(varName: string): string {
        if (!this.shouldDecodeJson) return `${varName}`;
        const itemName = `${varName}Item`;
        return `${varName}.map((${itemName}) => ${this.itemsRunType.getJsonDecodeCode(itemName)})`;
    }
    getMockCode(varName: string): string {
        const itemName = `${varName}Item`;
        return `${varName} = Array.from({length: Math.floor(Math.random() * 10)}, () => {
            let ${itemName};
            ${this.itemsRunType.getMockCode(itemName)}
            return ${itemName};
        })`;
    }
}
