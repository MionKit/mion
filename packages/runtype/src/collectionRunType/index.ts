import {TypeIndexSignature} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {addToPathChain, toLiteral} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class IndexSignatureRunType implements RunType<TypeIndexSignature> {
    public readonly name: string;
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly propertiesRunType: RunType;
    constructor(
        public readonly src: TypeIndexSignature,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.propertiesRunType = visitor(src.type, nestLevel);
        this.isJsonEncodeRequired = this.propertiesRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.propertiesRunType.isJsonDecodeRequired;
        this.name = `index<${this.propertiesRunType.name}>`;
    }
    isTypeJIT(varName: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        return `typeof ${varName} === 'object' && Object.entries(${varName}).every(([${keyName}, ${valueName}]) => (${this.propertiesRunType.isTypeJIT(valueName)}))`;
    }
    typeErrorsJIT(varName: string, errorsName: string, pathLiteral: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        const propertyName = `propεrty${this.nestLevel}`;
        const propertyPath = addToPathChain(pathLiteral, propertyName, true);

        return (
            `if (typeof ${varName} !== 'object') ${errorsName}.push({path: ${pathLiteral}, expected: ${toLiteral(this.name)}});` +
            `else Object.entries(${varName}).forEach(([${keyName}, ${valueName}]) => {${this.propertiesRunType.typeErrorsJIT(valueName, errorsName, propertyPath)}})`
        );
    }
    jsonEncodeJIT(varName: string): string {
        if (!this.isJsonEncodeRequired) return `${varName}`;
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        return `Object.entries(${varName}).reduce((acc, [${keyName}, ${valueName}]) => {
            acc[${keyName}] = ${this.propertiesRunType.jsonEncodeJIT(valueName)};
            return acc;
        }, {})`;
    }
    jsonStringifyJIT(varName: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        return `Object.entries(${varName}).reduce((acc, [${keyName}, ${valueName}]) => {
            acc[${keyName}] = ${this.propertiesRunType.jsonStringifyJIT(valueName)};
            return acc;
        }, {})`;
    }
    jsonDecodeJIT(varName: string): string {
        const keyName = `kεy${this.nestLevel}`;
        const valueName = `valuε${this.nestLevel}`;
        return `Object.entries(${varName}).reduce((acc, [${keyName}, ${valueName}]) => {
            acc[${keyName}] = ${this.propertiesRunType.jsonDecodeJIT(valueName)};
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