/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeLiteral} from '@deepkit/type';
import {JitJsonEncoder, RunType, RunTypeVisitor} from '../types';
import {SymbolJitJsonENcoder} from './symbol';
import {BigIntJitJsonENcoder} from './bigInt';
import {RegexpJitJsonEncoder} from './regexp';
import {scapeQ, toLiteral} from '../utils';

const noEncoder: JitJsonEncoder = {
    decodeFromJson(varName: string) {
        return `${varName}`;
    },
    encodeToJson(varName: string) {
        return `${varName}`;
    },
};

export class LiteralRunType implements RunType<TypeLiteral> {
    public readonly name: string;
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
    public readonly jitJsonEncoder: JitJsonEncoder;
    constructor(
        public readonly src: TypeLiteral,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        switch (true) {
            case typeof src.literal === 'bigint':
                this.jitJsonEncoder = BigIntJitJsonENcoder;
                this.shouldEncodeJson = true;
                this.shouldDecodeJson = true;
                this.name = 'bigint';
                break;
            case typeof src.literal === 'symbol':
                this.jitJsonEncoder = SymbolJitJsonENcoder;
                this.shouldEncodeJson = true;
                this.shouldDecodeJson = true;
                this.name = 'symbol';
                break;
            case typeof src.literal === 'string':
                this.jitJsonEncoder = noEncoder;
                this.shouldEncodeJson = false;
                this.shouldDecodeJson = false;
                this.name = 'string';
                break;
            case src.literal instanceof RegExp:
                this.jitJsonEncoder = RegexpJitJsonEncoder;
                this.shouldEncodeJson = true;
                this.shouldDecodeJson = true;
                this.name = 'RegExp';
                break;
            default:
                this.jitJsonEncoder = noEncoder;
                this.shouldEncodeJson = false;
                this.shouldDecodeJson = false;
                this.name = typeof src.literal;
        }
    }
    getValidateCode(varName: string): string {
        if (typeof this.src.literal === 'symbol') return validateSymbol(varName, this.src.literal);
        else if (this.src.literal instanceof RegExp) return validateRegExp(varName, this.src.literal);
        else if (typeof this.src.literal === 'bigint') return validateBigInt(varName, this.src.literal);
        else return validateLiteral(varName, this.src.literal);
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, itemPath: string): string {
        if (typeof this.src.literal === 'symbol')
            return validateSymbolWithErrors(varName, errorsName, itemPath, this.src.literal);
        else if (this.src.literal instanceof RegExp)
            return validateRegExpWithErrors(varName, errorsName, itemPath, this.src.literal);
        else if (typeof this.src.literal === 'bigint')
            return validateBigIntWithErrors(varName, errorsName, itemPath, this.src.literal);
        return validateLiteralWithErrors(varName, errorsName, itemPath, this.src.literal);
    }
    getJsonEncodeCode(varName: string): string {
        return this.jitJsonEncoder.encodeToJson(varName);
    }
    getJsonDecodeCode(varName: string): string {
        return this.jitJsonEncoder.decodeFromJson(varName);
    }
    getMockCode(varName: string): string {
        if (typeof this.src.literal === 'symbol') return `${varName} = Symbol('${this.src.literal.description}')`;
        return `${varName} = ${toLiteral(this.src.literal)}`;
    }
}

function validateBigInt(varName: string, lit: bigint): string {
    return `${varName} === ${toLiteral(lit)}`;
}

function validateSymbol(varName: string, sbl: symbol): string {
    return `typeof ${varName} === 'symbol' && ${varName}.description === ${toLiteral(sbl.description)}`;
}

function validateRegExp(varName: string, regexp: RegExp): string {
    return `String(${varName}) === String(${regexp})`;
}

function validateLiteral(varName: string, literal: Exclude<TypeLiteral['literal'], symbol>): string {
    return `${varName} === ${toLiteral(literal)}`;
}

function validateBigIntWithErrors(varName: string, errorsName: string, itemPath: string, lit: bigint): string {
    return `if (${varName} !== ${toLiteral(lit)}) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a bigint: ${lit.toString()}n'})`;
}

function validateSymbolWithErrors(varName: string, errorsName: string, itemPath: string, sbl: symbol): string {
    return `if (typeof ${varName} !== 'symbol' || ${varName}.description !== ${toLiteral(sbl.description)}) {
        ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a symbol: ${sbl.toString()}'})
    }`;
}

function validateRegExpWithErrors(varName: string, errorsName: string, itemPath: string, regexp: RegExp): string {
    return `if (String(${varName}) !== String(${regexp})) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a RegExp: ${scapeQ(regexp)}'})`;
}

function validateLiteralWithErrors(
    varName: string,
    errorsName: string,
    itemPath: string,
    literal: Exclude<TypeLiteral['literal'], symbol>
): string {
    return `if (${varName} !== ${toLiteral(literal)}) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be ${scapeQ(literal)}'})`;
}
