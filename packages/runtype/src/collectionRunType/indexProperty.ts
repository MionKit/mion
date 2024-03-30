import {ReflectionKind, TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, isFunctionKind, skipJsonDecode, skipJsonEncode} from '../utils';
import {jitUtilsAsJson} from '../constants';
import {NumberRunType} from '../singleRunType/number';
import {StringRunType} from '../singleRunType/string';
import {SymbolRunType} from '../singleRunType/symbol';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType extends BaseRunType<TypeIndexSignature> {
    public readonly name: string;
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly indexType: RunType;
    public readonly propType: NumberRunType | StringRunType | SymbolRunType;
    public readonly isReadonly: boolean;
    public readonly shouldSerialize: boolean;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeIndexSignature,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.indexType = visitor(src.type, nestLevel, opts);
        this.propType = visitor(src.index, nestLevel, opts) as NumberRunType | StringRunType | SymbolRunType;
        this.shouldSerialize = !isFunctionKind(src.type.kind) && src.index.kind !== ReflectionKind.symbol;
        this.isReadonly = false; // TODO: readonly allowed to set in typescript but not present in deepkit
        this.isJsonEncodeRequired = this.indexType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.indexType.isJsonDecodeRequired;
        this.name = `index<${this.indexType.name}>`;
    }
    JIT_isType(varName: string): string {
        if (!this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.JIT_isType(itemAccessor);
        const forLoop = `for (const ${indexName} in ${varName}) {if (!(${itemCode})) return false;}`;
        return `(function() {${forLoop}return true})()`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathLiteral: string): string {
        if (!this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const listItemPath = addToPathChain(pathLiteral, indexName, false);
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.JIT_typeErrors(itemAccessor, errorsName, listItemPath);
        return `for (const ${indexName} in ${varName}) {${itemCode}}`;
    }
    JIT_jsonEncode(varName: string): string {
        if (skipJsonEncode(this) || !this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.JIT_jsonEncode(itemAccessor);
        if (!itemCode) return '';
        return `for (const ${indexName} in ${varName}) {${itemCode}}`;
    }
    JIT_jsonDecode(varName: string): string {
        if (skipJsonDecode(this) || !this.shouldSerialize) return '';
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.JIT_jsonDecode(itemAccessor);
        if (!itemCode) return '';
        return `for (const ${indexName} in ${varName}) {${itemCode}}`;
    }
    JIT_jsonStringify(varName: string): string {
        const arrName = `prΦpsλrr${this.nestLevel}`;
        const indexName = `prΦp${this.nestLevel}`;
        const itemAccessor = `${varName}[${indexName}]`;
        const itemCode = this.indexType.JIT_jsonStringify(itemAccessor);
        const forLoop = `const ${arrName} = []; for (const ${indexName} in ${varName}) {if (${itemAccessor} !== undefined) ${arrName}.push(${jitUtilsAsJson}(${indexName}) + ':' + ${itemCode})}`;
        const itemsCode = `(function(){${forLoop}; return ${arrName}.join(',')})()`;
        return itemsCode;
    }
    mock(parentMockObj: Record<string | number | symbol, any>, ...args: any[]): any {
        const length = Math.floor(Math.random() * 10);
        for (let i = 0; i < length; i++) {
            let propName: number | string | symbol;
            switch (true) {
                case !!(this.propType instanceof NumberRunType):
                    propName = i;
                    break;
                case !!(this.propType instanceof StringRunType):
                    propName = `key${i}`;
                    break;
                case !!(this.propType instanceof SymbolRunType):
                    propName = Symbol.for(`key${i}`);
                    break;
                default:
                    throw new Error('Invalid index signature type');
            }
            parentMockObj[propName] = this.indexType.mock(...args);
        }
    }
}
