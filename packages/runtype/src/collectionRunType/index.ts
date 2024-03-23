import {TypeIndexSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, toLiteral} from '../utils';

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
    public readonly propertiesRunType: RunType;
    constructor(
        visitor: RunTypeVisitor,
        src: TypeIndexSignature,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.propertiesRunType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.propertiesRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.propertiesRunType.isJsonDecodeRequired;
        this.name = `index<${this.propertiesRunType.name}>`;
    }
    JIT_isType(varName: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        return `typeof ${varName} === 'object' && Object.entries(${varName}).every(([${keyName}, ${valueName}]) => (${this.propertiesRunType.JIT_isType(valueName)}))`;
    }
    JIT_typeErrors(varName: string, errorsName: string, pathLiteral: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        const propertyName = `propεrty${this.nestLevel}`;
        const propertyPath = addToPathChain(pathLiteral, propertyName, true);

        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else Object.entries(${varName}).forEach(([${keyName}, ${valueName}]) => {${this.propertiesRunType.JIT_typeErrors(valueName, errorsName, propertyPath)}})`
        );
    }
    JIT_jsonEncode(varName: string): string {
        if (!this.isJsonEncodeRequired) return ``;
        const keyName = `kεy${this.nestLevel}`;
        const itemAccessor = `${varName}[${keyName}]`;
        const itemCode = this.propertiesRunType.JIT_jsonEncode(itemAccessor);
        if (!itemCode) return ``;
        return `Object.keys(${varName}).forEach((${keyName}) => {${itemCode}})`;
    }
    JIT_jsonDecode(varName: string): string {
        if (!this.isJsonDecodeRequired) return ``;
        const keyName = `kεy${this.nestLevel}`;
        const itemAccessor = `${varName}[${keyName}]`;
        const itemCode = this.propertiesRunType.JIT_jsonDecode(itemAccessor);
        if (!itemCode) return ``;
        return `Object.keys(${varName}).forEach((${keyName}) => {${itemCode}})`;
    }
    JIT_jsonStringify(varName: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        return `Object.entries(${varName}).reduce((acc, [${keyName}, ${valueName}]) => {
            acc[${keyName}] = ${this.propertiesRunType.JIT_jsonStringify(valueName)};
            return acc;
        }, {})`;
    }
    mock(varName: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        return `${varName} = Object.entries(${varName}).reduce((acc, [${keyName}, ${valueName}]) => {
            let ${valueName};
            ${this.propertiesRunType.mock(valueName)}
            acc[${keyName}] = ${valueName};
            return acc;
        }, {})`;
    }
}
