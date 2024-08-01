/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {JitErrorPath, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, hasCircularRunType, skipJsonDecode, skipJsonEncode, toLiteral, pathChainToLiteral} from '../utils';
import {random} from '../mock';
import {BaseRunType} from '../baseRunTypes';

export class ArrayRunType extends BaseRunType<TypeArray> {
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly hasCircular: boolean;
    public readonly itemsRunType: RunType;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeArray,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.itemsRunType = visitor(src.type, [...parents, this], opts);
        this.isJsonEncodeRequired = this.itemsRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.itemsRunType.isJsonDecodeRequired;
        this.hasCircular = this.itemsRunType.hasCircular || hasCircularRunType(this.itemsRunType, parents);
    }
    getJitId(): string {
        return `${this.src.kind}:${this.itemsRunType.getJitId()}`;
    }
    compileIsType(varName: string): string {
        const indexName = `indεx${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.itemsRunType.compileIsType(itemAccessor);
        const forLoop = `for (let ${indexName} = 0; ${indexName} < ${varName}.length; ${indexName}++) {if (!(${itemCode})) return false;}`;
        return `Array.isArray(${varName}) && (function() {${forLoop}return true})()`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        const indexName = `indεx${this.nestLevel}`;
        const listItemPath = addToPathChain(pathChain, indexName, false);
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.itemsRunType.compileTypeErrors(itemAccessor, errorsName, listItemPath);
        const arrayCode = `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}});`;
        return arrayCode + `else { for (let ${indexName} = 0; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}} }`;
    }
    compileJsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return '';
        const indexName = `indεx${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.itemsRunType.compileJsonEncode(itemAccessor);
        if (!itemCode) return '';
        return `for (let ${indexName} = 0; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    compileJsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return '';
        const indexName = `indεx${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.itemsRunType.compileJsonDecode(itemAccessor);
        if (!itemCode) return '';
        return `for (let ${indexName} = 0; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    compileJsonStringify(varName: string): string {
        const arrName = `rεsultλrr${this.nestLevel}`;
        const indexName = `indεx${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.itemsRunType.compileJsonStringify(itemAccessor);
        const forLoop = `const ${arrName} = []; for (let ${indexName} = 0; ${indexName} < ${varName}.length; ${indexName}++) {${arrName}.push(${itemCode})}`;
        const itemsCode = `(function(){${forLoop}; return ${arrName}.join(',')})()`;
        return `'[' + ${itemsCode} + ']'`;
    }
    mock(length = random(0, 30), ...args: any[]): any[] {
        return Array.from({length}, () => this.itemsRunType.mock(...args));
    }
}
