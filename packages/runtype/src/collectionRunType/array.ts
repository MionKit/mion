/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isSameType, TypeArray} from '../_deepkit/src/reflection/type';
import {JitErrorPath, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {
    addToPathChain,
    hasCircularRunType,
    skipJsonDecode,
    skipJsonEncode,
    toLiteral,
    pathChainToLiteral,
    replaceInCode,
} from '../utils';
import {random} from '../mock';
import {BaseRunType} from '../baseRunTypes';
import {jitVarNames} from '../jitUtils';
import {
    callJitCachedFn,
    jitCacheCompileIsType,
    jitCacheCompileJsonDecode,
    jitCacheCompileJsonEncode,
    jitCacheCompileJsonStringify,
    jitCacheCompileTypeErrors,
    selfInvokeCode,
} from '../jitCacheCompiler';

export class ArrayRunType extends BaseRunType<TypeArray> {
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly hasCircular: boolean;
    public readonly itemsRunType: RunType;
    public readonly shouldCacheJit: boolean;
    public readonly shouldCallJitCache: boolean;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeArray,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.itemsRunType = visitor(src.type, [...parents, this], opts);
        this.isJsonEncodeRequired = this.itemsRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.itemsRunType.isJsonDecodeRequired;
        this.hasCircular = this.itemsRunType.hasCircular || hasCircularRunType(this, this.itemsRunType, parents);
        this.shouldCacheJit = this.hasCircular || !!this.src.typeName;
        this.shouldCallJitCache = isSameType(this.itemsRunType.src, this.src);
    }
    _jitId: string | undefined;
    getJitId(): string {
        if (this._jitId) return this._jitId;
        if (this.shouldCallJitCache) return (this._jitId = `${this.src.kind}(${this.src.kind})`);
        return (this._jitId = `${this.src.kind}:${this.itemsRunType.getJitId()}`);
    }
    compileIsType(varName: string): string {
        if (this.shouldCallJitCache) {
            const keepThis = (vn, jid) => this._compileIsType(vn, jid);
            return jitCacheCompileIsType(this, varName, keepThis);
        }
        return this._compileIsType(varName, null, true);
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        if (this.shouldCallJitCache) {
            const keepThis = (vn, en, pc, jid) => this._compileTypeErrors(vn, en, pc, jid);
            return jitCacheCompileTypeErrors(this, varName, errorsName, pathChain, keepThis);
        }
        return this._compileTypeErrors(varName, errorsName, pathChain);
    }
    compileJsonEncode(varName: string): string {
        if (this.shouldCallJitCache) {
            const keepThis = (vn, jid) => this._compileJsonEncode(vn, jid);
            return jitCacheCompileJsonEncode(this, varName, keepThis);
        }
        return this._compileJsonEncode(varName);
    }
    compileJsonDecode(varName: string): string {
        if (this.shouldCallJitCache) {
            const keepThis = (vn, jid) => this._compileJsonDecode(vn, jid);
            return jitCacheCompileJsonDecode(this, varName, keepThis);
        }
        return this._compileJsonDecode(varName);
    }
    compileJsonStringify(varName: string): string {
        if (this.shouldCallJitCache) {
            const keepThis = (vn, jid) => this._compileJsonStringify(vn, jid);
            return jitCacheCompileJsonStringify(this, varName, keepThis);
        }
        return this._compileJsonStringify(varName, null, true);
    }
    mock(length = random(0, 30), ...args: any[]): any[] {
        return Array.from({length}, () => this.itemsRunType.mock(...args));
    }

    private _compileIsType(varName: string, cachedJitId = null, selfInvoke = false): string {
        const names = {
            areItemsTypeValid: `λreItεmsTypεsVλlid${this.nestLevel}`,
            index: `indεx${this.nestLevel}`,
            varName,
        };
        const itemAccessor = `${names.varName}[${names.index}]`;
        const itemsCode = cachedJitId
            ? callJitCachedFn([itemAccessor], cachedJitId)
            : this.itemsRunType.compileIsType(itemAccessor);
        const pseudoCode = `
            function areItemsTypeValid() {
                for (let index = 0; index < varName.length; index++) {
                    const isItemValid = (itemsPseudoCode); 
                    if (!isItemValid) return false;
                }
                return true;
            }
            return Array.isArray(varName) && areItemsTypeValid();`;
        const code = replaceInCode(pseudoCode, names).replace('itemsPseudoCode', itemsCode);
        return selfInvokeCode(code, selfInvoke);
    }
    private _compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath, cachedJitId = null): string {
        const names = {
            index: `indεx${this.nestLevel}`,
            expectedName: toLiteral(this.getName()),
            errorPath: cachedJitId ? jitVarNames.pathChain : pathChainToLiteral(pathChain),
            varName,
            errorsName,
        };
        const itemAccessor = `${names.varName}[${names.index}]`;
        const itemCode = cachedJitId
            ? callJitCachedFn([itemAccessor, `[...${jitVarNames.pathChain}, ${names.index}]`], cachedJitId)
            : this.itemsRunType.compileTypeErrors(itemAccessor, errorsName, addToPathChain(pathChain, names.index, false));
        const pseudoCode = `
            if (!Array.isArray(varName)) errorsName.push({path: errorPath, expected: expectedName});
            else {
                for (let index = 0; index < varName.length; index++) {
                    itemsPseudoCode
                }
            }`;
        return replaceInCode(pseudoCode, names).replace('itemsPseudoCode', itemCode);
    }
    private _compileJsonEncode(varName: string, cachedJitId = null): string {
        if (skipJsonEncode(this)) return '';
        const indexName = `indεx${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = cachedJitId
            ? callJitCachedFn([itemAccessor], cachedJitId)
            : this.itemsRunType.compileJsonEncode(itemAccessor);
        if (!itemCode) return '';
        return `for (let ${indexName} = 0; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    private _compileJsonDecode(varName: string, cachedJitId = null): string {
        if (skipJsonDecode(this)) return '';
        const indexName = `indεx${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = cachedJitId
            ? callJitCachedFn([itemAccessor], cachedJitId)
            : this.itemsRunType.compileJsonDecode(itemAccessor);
        if (!itemCode) return '';
        return `for (let ${indexName} = 0; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    private _compileJsonStringify(varName: string, cachedJitId = null, selfInvoke = false): string {
        const names = {
            varName,
            index: `indεx${this.nestLevel}`,
            jsonItems: `jsΦnItεms${this.nestLevel}`,
        };
        const itemAccessor = `${names.varName}[${names.index}]`;
        const itemCode = cachedJitId
            ? callJitCachedFn([itemAccessor], cachedJitId)
            : this.itemsRunType.compileJsonStringify(itemAccessor);
        const pseudoCode = `
            const jsonItems = [];
            for (let index = 0; index < varName.length; index++) {
                jsonItems.push(itemsPseudoCode)
            };
            return '[' + jsonItems.join(',') + ']';`;
        const code = replaceInCode(pseudoCode, names).replace('itemsPseudoCode', itemCode);
        return selfInvokeCode(code, selfInvoke);
    }
}
