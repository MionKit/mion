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
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
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
        this.shouldEncodeJson = this.memberType.shouldEncodeJson;
        this.shouldDecodeJson = this.memberType.shouldDecodeJson;
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
        const pVarName = `${varName}${this.propRef}`;
        if (this.isOptional) {
            return `${varName}${this.propRef} === undefined || (${this.memberType.isTypeJIT(pVarName)})`;
        }
        return this.memberType.isTypeJIT(pVarName);
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        if (this.isSymbol) return '';
        const pVarName = `${varName}${this.propRef}`;
        if (this.isOptional) {
            return `if (${pVarName} !== undefined) {${this.memberType.typeErrorsJIT(
                pVarName,
                errorsName,
                addToPathChain(pathChain, this.propName)
            )}}`;
        }
        return this.memberType.typeErrorsJIT(pVarName, errorsName, addToPathChain(pathChain, this.propName));
    }
    jsonEncodeJIT(varName: string): string {
        if (this.isSymbol) return '';
        const valCode = this.memberType.jsonEncodeJIT(`${varName}${this.propRef}`);
        const jsName = this.isSafe ? this.propName : toLiteral(this.propName);
        return `${jsName}: ${valCode}`;
    }
    jsonStringifyJIT(varName: string, isFirst = false): string {
        if (this.isSymbol) return '';
        const valCode = this.memberType.jsonStringifyJIT(`${varName}${this.propRef}`);
        // firs stringify sanitizes string, second is the actual json
        const proNameJSon = JSON.stringify(JSON.stringify(this.propName));
        if (this.isOptional) {
            return `${isFirst ? '' : '+'}(${varName}${this.propRef} === undefined ?'':${isFirst ? '' : `(','+`}${proNameJSon}+':'+${valCode}))`;
        }
        return `${isFirst ? '' : `+','+`}${proNameJSon}+':'+${valCode}`;
    }
    jsonDecodeJIT(varName: string): string {
        if (this.isSymbol) return '';
        const valCode = this.memberType.jsonDecodeJIT(`${varName}${this.propRef}`);
        const jsName = this.isSafe ? this.propName : toLiteral(this.propName);
        return `${jsName}: ${valCode}`;
    }
    mock(...args: any[]): any {
        return this.memberType.mock(...args);
    }
}
