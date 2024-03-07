/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypePropertySignature} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {addToPathChain} from '../utils';

export class PropertySignatureRunType implements RunType<TypePropertySignature> {
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
    public readonly memberType: RunType;
    public readonly name: string;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly propName: string;
    public readonly isSymbol: boolean;
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
        this.propName = typeof src.name === 'symbol' ? src.name.toString() : `${src.name}`;
        this.isSymbol = typeof src.name === 'symbol';
    }
    getValidateCode(varName: string): string {
        if (this.isSymbol) return '';
        const pVarName = `${varName}.${this.propName}`;
        if (this.isOptional) {
            return `${varName}.${this.propName} === undefined || (${this.memberType.getValidateCode(pVarName)})`;
        }
        return this.memberType.getValidateCode(pVarName);
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        if (this.isSymbol) return '';
        const pVarName = `${varName}.${this.propName}`;
        if (this.isOptional) {
            return `if (${pVarName} !== undefined) {${this.memberType.getValidateCodeWithErrors(
                pVarName,
                errorsName,
                addToPathChain(pathChain, this.propName)
            )}}`;
        }
        return this.memberType.getValidateCodeWithErrors(pVarName, errorsName, addToPathChain(pathChain, this.propName));
    }
    getJsonEncodeCode(varName: string): string {
        if (this.isSymbol) return '';
        const valCode = this.memberType.getJsonEncodeCode(`${varName}.${this.propName}`);
        return `${this.propName}: ${valCode}`;
    }
    getJsonDecodeCode(varName: string): string {
        if (this.isSymbol) return '';
        const valCode = this.memberType.getJsonDecodeCode(`${varName}.${this.propName}`);
        return `${this.propName}: ${valCode}`;
    }
    getMockCode(varName: string): string {
        if (this.isSymbol) return '';
        const pVarName = `${varName}.${this.propName}`;
        const propMockCode = this.memberType.getMockCode(pVarName);
        if (this.isOptional) return `if (Math.random() < 0.2) ${pVarName} = undefined; else {${propMockCode}}`;
        return propMockCode;
    }
}
