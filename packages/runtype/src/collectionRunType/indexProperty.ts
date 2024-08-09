import {ReflectionKind, TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {JitErrorPath, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, hasCircularRunType, isFunctionKind, skipJsonDecode, skipJsonEncode} from '../utils';
import {NumberRunType} from '../singleRunType/number';
import {StringRunType} from '../singleRunType/string';
import {SymbolRunType} from '../singleRunType/symbol';
import {jitVarNames} from '../jitUtils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends BaseRunType<TypeIndexSignature> {
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly hasCircular: boolean;
    public readonly isCircular: boolean;
    public readonly indexType: RunType;
    public readonly indexKeyType: NumberRunType | StringRunType | SymbolRunType;
    public readonly isReadonly: boolean;
    public readonly shouldSerialize: boolean;
    public readonly propName: string;
    protected propertySeparator = '&';
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeIndexSignature,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        const newParents = [...parents, this];
        this.indexType = visitor(src.type, newParents, opts);
        this.indexKeyType = visitor(src.index, newParents, opts) as NumberRunType | StringRunType | SymbolRunType;
        this.shouldSerialize = !isFunctionKind(src.type.kind) && src.index.kind !== ReflectionKind.symbol;
        this.isReadonly = false; // TODO: readonly allowed to set in typescript but not present in deepkit
        this.isJsonEncodeRequired = this.indexType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.indexType.isJsonDecodeRequired;
        this.hasCircular = this.indexType.hasCircular || hasCircularRunType(this, this.indexType, parents);
        this.isCircular = this.hasCircular;
        this.propName = `${src.index.kind}`;
    }
    getJitId(): string | number {
        return `${this.src.kind}:${this.propName}:${this.indexType.getJitId()}`;
    }
    compileIsType(varName: string): string {
        if (!this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.compileIsType(itemAccessor);
        return `(function() {
            for (const ${indexName} in ${varName}) {
                if (!(${itemCode})) return false;
            }
            return true;
        })()`;
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        if (!this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const listItemPath = addToPathChain(pathChain, indexName, false);
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.compileTypeErrors(itemAccessor, errorsName, listItemPath);
        return `for (const ${indexName} in ${varName}) {${itemCode}}`;
    }
    compileJsonEncode(varName: string): string {
        if (skipJsonEncode(this) || !this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.compileJsonEncode(itemAccessor);
        if (!itemCode) return '';
        return `for (const ${indexName} in ${varName}) {${itemCode}}`;
    }
    compileJsonDecode(varName: string): string {
        if (skipJsonDecode(this) || !this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.compileJsonDecode(itemAccessor);
        if (!itemCode) return '';
        return `for (const ${indexName} in ${varName}) {${itemCode}}`;
    }
    compileJsonStringify(varName: string): string {
        const arrName = `prΦpsλrr${this.nestLevel}`;
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.compileJsonStringify(itemAccessor);
        const forLoop = `const ${arrName} = []; for (const ${indexName} in ${varName}) {if (${itemAccessor} !== undefined) ${arrName}.push(${jitVarNames.asJSONString}(${indexName}) + ':' + ${itemCode})}`;
        const itemsCode = `(function(){${forLoop}; return ${arrName}.join(',')})()`;
        return itemsCode;
    }
    mock(parentMockObj: Record<string | number | symbol, any>, ...args: any[]): any {
        const length = Math.floor(Math.random() * 10);
        for (let i = 0; i < length; i++) {
            let propName: number | string | symbol;
            switch (true) {
                case !!(this.indexKeyType instanceof NumberRunType):
                    propName = i;
                    break;
                case !!(this.indexKeyType instanceof StringRunType):
                    propName = `key${i}`;
                    break;
                case !!(this.indexKeyType instanceof SymbolRunType):
                    propName = Symbol.for(`key${i}`);
                    break;
                default:
                    throw new Error('Invalid index signature type');
            }
            parentMockObj[propName] = this.indexType.mock(...args);
        }
    }
}
