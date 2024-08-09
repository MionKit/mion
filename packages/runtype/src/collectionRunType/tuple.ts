/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {JitErrorPath, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, pathChainToLiteral, skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';

export class TupleRunType extends BaseRunType<TypeTuple> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly hasCircular: boolean;
    // public readonly isCircular: boolean; // TODO
    public readonly runTypes: RunType[];
    public readonly shouldCacheJit: boolean;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTuple,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        const newParents = [...parents, this];
        this.runTypes = src.types.map((t) => visitor(t, newParents, opts));
        this.isJsonEncodeRequired = this.runTypes.some((rt) => rt.isJsonEncodeRequired);
        this.isJsonDecodeRequired = this.runTypes.some((rt) => rt.isJsonDecodeRequired);
        this.hasCircular = this.runTypes.some((rt) => rt.hasCircular);
        this.shouldCacheJit = this.hasCircular && (!!this.src.typeName || !!this.src.id);
    }
    private _jitId: string | undefined;
    getJitId(): string {
        if (this._jitId) return this._jitId;
        // TODO: we need to check also for serializable tuple members as not all of them might be serializable
        this._jitId = `${this.src.kind}{${this.runTypes.map((prop) => `${prop.getJitId()}`).join(',')}}`;
        return this._jitId;
    }
    compileIsType(varName: string): string {
        const itemsCode = this.runTypes.map((rt, i) => `(${rt.compileIsType(`${varName}[${i}]`)})`).join(' && ');
        return `${varName}.length <= ${this.runTypes.length} && ${itemsCode}`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        const itemsCode = this.runTypes
            .map((rt, i) => rt.compileTypeErrors(`${varName}[${i}]`, errorsName, addToPathChain(pathChain, i)))
            .join(';');
        return (
            `if (!Array.isArray(${varName}) || ${varName}.length > ${this.runTypes.length}) ${errorsName}.push({path: ${pathChainToLiteral(pathChain)}, expected: ${toLiteral(this.getName())}});` +
            `else {${itemsCode}}`
        );
    }
    compileJsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return '';
        const encodeCodes = this.runTypes.map((rt, i) => {
            const useNative = !this.opts?.strictJSON && !rt.isJsonEncodeRequired;
            const accessor = `${varName}[${i}]`;
            return useNative ? `` : `${accessor} = ${rt.compileJsonEncode(accessor)}`;
        });
        return encodeCodes.filter((code) => !!code).join(';');
    }
    compileJsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return varName;
        const decodeCodes = this.runTypes.map((rt, i) => {
            const useNative = !this.opts?.strictJSON && !rt.isJsonDecodeRequired;
            const accessor = `${varName}[${i}]`;
            return useNative ? `` : `${accessor} = ${rt.compileJsonDecode(accessor)}`;
        });
        return decodeCodes.filter((code) => !!code).join(';');
    }
    compileJsonStringify(varName: string): string {
        const encodeCodes = this.runTypes.map((rt, i) => rt.compileJsonStringify(`${varName}[${i}]`));
        return `'['+${encodeCodes.join(`+','+`)}+']'`;
    }
    mock(...tupleArgs: any[][]): any[] {
        return this.runTypes.map((rt, i) => rt.mock(...(tupleArgs?.[i] || [])));
    }
}
