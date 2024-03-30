import {TypeRest} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, skipJsonDecode, skipJsonEncode} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class RestParamsRunType extends BaseRunType<TypeRest> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberRunType: RunType;
    public readonly name: string;
    public readonly isOptional = true;
    public readonly isReadonly = false;
    public readonly paramName: string;
    public readonly default: any;

    constructor(
        visitor: RunTypeVisitor,
        src: TypeRest,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.memberRunType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
        this.paramName = (src as any).name || 'args';
        this.name = `${this.memberRunType.name}[]`;
    }
    JIT_isType(varName: string, itemIndex = 0): string {
        const indexName = `pλrλm${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.JIT_isType(itemAccessor);
        const forLoop = `for (let ${indexName} = ${itemIndex}; ${indexName} < ${varName}.length; ${indexName}++) {if (!(${itemCode})) return false;}`;
        return `(function() {${forLoop}return true})()`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string, itemIndex = 0): string {
        const indexName = `pλrλm${this.nestLevel}`;
        const listItemPath = addToPathChain(pathChain, indexName, false);
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.JIT_typeErrors(itemAccessor, errorsName, listItemPath);
        return `for (let ${indexName} = ${itemIndex}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    JIT_jsonEncode(varName: string, itemIndex = 0): string {
        if (skipJsonEncode(this)) return '';
        const indexName = `pλrλm${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.JIT_jsonEncode(itemAccessor);
        if (!itemCode) return '';
        return `for (let ${indexName} = ${itemIndex}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    JIT_jsonDecode(varName: string, itemIndex = 0): string {
        if (skipJsonDecode(this)) return '';
        const indexName = `pλrλm${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.JIT_jsonDecode(itemAccessor);
        if (!itemCode) return '';
        return `for (let ${indexName} = ${itemIndex}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    JIT_jsonStringify(varName: string, itemIndex = 0): string {
        const arrName = `rεsultλrr${this.nestLevel}`;
        const itemName = `itεm${this.nestLevel}`;
        const indexName = `indεx${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const sep = itemIndex === 0 ? '' : `','+`;
        const itemCode = this.memberRunType.JIT_jsonStringify(itemAccessor);
        const forLoop = `const ${arrName} = []; for (let ${indexName} = ${itemIndex}; ${indexName} < ${varName}.length; ${indexName}++) {const ${itemName} = ${itemCode}; if(${itemName}) ${arrName}.push(${itemName})}`;
        return `(function(){${forLoop}; if (!${arrName}.length) {return '';} else {return ${sep}${arrName}.join(',')} })()`;
    }
    mock(...args: any[]): string {
        return this.memberRunType.mock(...args);
    }
}
