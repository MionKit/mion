/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeLiteral} from '@deepkit/type';
import {JitJsonEncoder, RunType, RunTypeAccessor, RunTypeVisitor} from '../types';
import {SymbolJitJsonENcoder} from './symbol';
import {BigIntJitJsonENcoder} from './bigInt';
import {RegexpJitJsonEncoder} from './regexp';

const noEncoder: JitJsonEncoder = {
    decodeFromJson(varName: string) {
        return `${varName}`;
    },
    encodeToJson(varName: string) {
        return `${varName}`;
    },
};

export class LiteralRunType implements RunType<TypeLiteral> {
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
    public readonly jitJsonEncoder: JitJsonEncoder;
    constructor(
        public readonly src: TypeLiteral,
        public readonly visitor: RunTypeVisitor,
        public readonly path: RunTypeAccessor,
        public readonly nestLevel: number
    ) {
        switch (true) {
            case typeof src.literal === 'bigint':
                this.jitJsonEncoder = BigIntJitJsonENcoder;
                this.shouldEncodeJson = true;
                this.shouldDecodeJson = true;
                break;
            case typeof src.literal === 'symbol':
                this.jitJsonEncoder = SymbolJitJsonENcoder;
                this.shouldEncodeJson = true;
                this.shouldDecodeJson = true;
                break;
            case typeof src.literal === 'string':
                this.jitJsonEncoder = noEncoder;
                this.shouldEncodeJson = false;
                this.shouldDecodeJson = false;
                break;
            case src.literal instanceof RegExp:
                this.jitJsonEncoder = RegexpJitJsonEncoder;
                this.shouldEncodeJson = true;
                this.shouldDecodeJson = true;
                break;
            default:
                this.jitJsonEncoder = noEncoder;
                this.shouldEncodeJson = false;
                this.shouldDecodeJson = false;
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
        else if (typeof this.src.literal === 'bigint') return `${varName} = ${this.src.literal.toString()}n`;
        else if (typeof this.src.literal === 'string') return `${varName} = '${this.src.literal}'`;
        return `${varName} = ${this.src.literal}`;
    }
}

function validateBigInt(varName: string, lit: bigint): string {
    return `${varName} === ${lit.toString()}n`;
}

function validateSymbol(varName: string, sbl: symbol): string {
    return `typeof ${varName} === 'symbol' && ${varName}.description === '${sbl.description}'`;
}

function validateRegExp(varName: string, regexp: RegExp): string {
    return `String(${varName}) === String(${regexp})`;
}

function validateLiteral(varName: string, literal: Omit<TypeLiteral['literal'], 'symbol'>): string {
    const lit = typeof literal === 'string' ? `'${literal}'` : literal;
    return `${varName} === ${lit}`;
}

function validateBigIntWithErrors(varName: string, errorsName: string, itemPath: string, lit: bigint): string {
    return `if (${varName} !== ${lit.toString()}n) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a literal: ${lit.toString()}n'})`;
}

function validateSymbolWithErrors(varName: string, errorsName: string, itemPath: string, sbl: symbol): string {
    return `if (typeof ${varName} !== 'symbol' || ${varName}.description !== '${sbl.description}') {
        ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a literal: ${sbl.toString()}'})
    }`;
}

function validateRegExpWithErrors(varName: string, errorsName: string, itemPath: string, regexp: RegExp): string {
    return `if (String(${varName}) !== String(${regexp})) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a literal: ${regexp}'})`;
}

function validateLiteralWithErrors(
    varName: string,
    errorsName: string,
    itemPath: string,
    literal: Omit<TypeLiteral['literal'], 'symbol'>
): string {
    const lit = typeof literal === 'string' ? `'${literal}'` : literal;
    return `if (${varName} !== ${lit}) ${errorsName}.push({path: ${itemPath}, message: 'Expected to be a literal: ${literal}'})`;
}
