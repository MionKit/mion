/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypePropertySignature} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {addToPathChain, toLiteral} from '../utils';

export const validPropertyName = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class PropertySignatureRunType implements RunType<TypePropertySignature> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberType: RunType;
    public readonly name: string;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly propName: string | number;
    public readonly propRef: string;
    public readonly isSymbol: boolean;
    public readonly isSafe: boolean;
    constructor(
        public readonly src: TypePropertySignature,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.memberType = visitor(src.type, nestLevel);
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        this.name = this.memberType.name;
        this.isOptional = !!src.optional;
        this.isReadonly = !!src.readonly;
        if (typeof src.name === 'symbol') {
            this.isSymbol = true;
            this.propName = src.name.toString();
            this.propRef = ``;
            this.isSafe = true;
        } else {
            this.isSymbol = false;
            this.isSafe = (typeof src.name === 'string' && validPropertyName.test(src.name)) || typeof src.name === 'number';
            this.propName = src.name;
            this.propRef = this.isSafe ? `.${src.name}` : `[${toLiteral(src.name)}]`;
        }
    }
    isTypeJIT(varName: string): string {
        if (this.isSymbol) return '';
        const accessor = `${varName}${this.propRef}`;
        if (this.isOptional) {
            return `${accessor} === undefined || (${this.memberType.isTypeJIT(accessor)})`;
        }
        return this.memberType.isTypeJIT(accessor);
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        if (this.isSymbol) return '';
        const accessor = `${varName}${this.propRef}`;
        if (this.isOptional) {
            return `if (${accessor} !== undefined) {${this.memberType.typeErrorsJIT(
                accessor,
                errorsName,
                addToPathChain(pathChain, this.propName)
            )}}`;
        }
        return this.memberType.typeErrorsJIT(accessor, errorsName, addToPathChain(pathChain, this.propName));
    }
    jsonEncodeJIT(varName: string, isStrict?: boolean): string {
        if (this.isSymbol) return '';
        const jsName = this.isSafe ? this.propName : toLiteral(this.propName);
        const accessor = `${varName}${this.propRef}`;
        const useNative = !isStrict && !this.isJsonEncodeRequired;
        const valCode = useNative ? accessor : this.memberType.jsonEncodeJIT(accessor, isStrict);
        if (this.isOptional) {
            return `...(${accessor} === undefined ? {} : {${jsName}:${valCode}})`;
        }
        return `${jsName}:${valCode}`;
    }
    jsonStringifyJIT(varName: string, isFirst = false): string {
        if (this.isSymbol) return '';
        // firs stringify sanitizes string, second is the actual json
        const proNameJSon = JSON.stringify(JSON.stringify(this.propName));
        const accessor = `${varName}${this.propRef}`;
        const valCode = this.memberType.jsonStringifyJIT(accessor);
        if (this.isOptional) {
            return `${isFirst ? '' : '+'}(${accessor} === undefined ?'':${isFirst ? '' : `(','+`}${proNameJSon}+':'+${valCode}))`;
        }
        return `${isFirst ? '' : `+','+`}${proNameJSon}+':'+${valCode}`;
    }
    jsonDecodeJIT(varName: string, isStrict?: boolean): string {
        if (this.isSymbol) return '';
        const jsName = this.isSafe ? this.propName : toLiteral(this.propName);
        const accessor = `${varName}${this.propRef}`;
        const useNative = !isStrict && !this.isJsonDecodeRequired;
        const valCode = useNative ? accessor : this.memberType.jsonDecodeJIT(accessor, isStrict);
        if (this.isOptional) {
            return `...(${accessor} === undefined ? {} : {${jsName}:${valCode}})`;
        }
        return `${jsName}:${valCode}`;
    }
    mock(optionalProbability = 0.2, ...args: any[]): any {
        if (optionalProbability < 0 || optionalProbability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.isOptional && Math.random() < optionalProbability) return undefined;
        return this.memberType.mock(...args);
    }
}
