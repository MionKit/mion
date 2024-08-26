import {TypeRest} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';

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
    public readonly paramName: string;
    public readonly default: any;
    public readonly jitId: number | string;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeRest,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberRunType = visitor(src.type, parents, opts);
        parents.pop();
        this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
        this.paramName = (src as any).name || 'args';
        this.jitId = 'restParams'; // will be overridden later
    }

    getJitId(): string | number {
        // param name is irrelevant (not required) as only position matters
        return `${this.memberRunType.jitId}[]`;
    }

    compileIsType(parents: RunType[], varName: string, paramIndex = 0): string {
        parents.push(this);
        const indexName = `pλrλm${parents.length}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.compileIsType(parents, itemAccessor);
        const forLoop = `for (let ${indexName} = ${paramIndex}; ${indexName} < ${varName}.length; ${indexName}++) {if (!(${itemCode})) return false;}`;
        parents.pop();
        return `(function() {${forLoop}return true})()`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: (string | number)[], paramIndex = 0): string {
        parents.push(this);
        const indexName = `pλrλm${parents.length}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.compileTypeErrors(parents, itemAccessor, pathC);
        parents.pop();
        return `for (let ${indexName} = ${paramIndex}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    compileJsonEncode(parents: RunType[], varName: string, paramIndex = 0): string {
        if (shouldSkipJsonEncode(this)) return '';
        parents.push(this);
        const indexName = `pλrλm${parents.length}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.compileJsonEncode(parents, itemAccessor);
        parents.pop();
        if (!itemCode) return '';
        return `for (let ${indexName} = ${paramIndex}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    compileJsonDecode(parents: RunType[], varName: string, paramIndex = 0): string {
        if (shouldSkipJsonDecode(this)) return '';
        parents.push(this);
        const indexName = `pλrλm${parents.length}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.memberRunType.compileJsonDecode(parents, itemAccessor);
        parents.pop();
        if (!itemCode) return '';
        return `for (let ${indexName} = ${paramIndex}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    compileJsonStringify(parents: RunType[], varName: string, paramIndex = 0): string {
        parents.push(this);
        const arrName = `rεsultλrr${parents.length}`;
        const itemName = `itεm${parents.length}`;
        const indexName = `indεx${parents.length}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const sep = paramIndex === 0 ? '' : `','+`;
        const itemCode = this.memberRunType.compileJsonStringify(parents, itemAccessor);
        const forLoop = `
            const ${arrName} = [];
            for (let ${indexName} = ${paramIndex}; ${indexName} < ${varName}.length; ${indexName}++) {
                const ${itemName} = ${itemCode};
                if(${itemName}) ${arrName}.push(${itemName});
            }`;
        parents.pop();
        return `(function(){
            ${forLoop}
            if (!${arrName}.length) {return '';}
            else {return ${sep}${arrName}.join(',')}
        })()`;
    }
    mock(...args: any[]): string {
        return this.memberRunType.mock(...args);
    }
}
