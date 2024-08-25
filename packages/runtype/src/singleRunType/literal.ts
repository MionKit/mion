/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {SymbolJitJsonENcoder} from './symbol';
import {BigIntJitJsonENcoder} from './bigInt';
import {RegexpJitJsonEncoder} from './regexp';
import {getErrorPath, toLiteral} from '../utils';
import {SingleRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class LiteralRunType extends SingleRunType<TypeLiteral> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly jitJsonEncoder: JitJsonEncoder;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeLiteral,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        switch (true) {
            case typeof src.literal === 'bigint':
                this.jitJsonEncoder = BigIntJitJsonENcoder;
                this.isJsonEncodeRequired = true;
                this.isJsonDecodeRequired = true;
                break;
            case typeof src.literal === 'symbol':
                this.jitJsonEncoder = SymbolJitJsonENcoder;
                this.isJsonEncodeRequired = true;
                this.isJsonDecodeRequired = true;
                break;
            case typeof src.literal === 'string':
                this.jitJsonEncoder = noEncoder;
                this.isJsonEncodeRequired = false;
                this.isJsonDecodeRequired = false;
                break;
            case src.literal instanceof RegExp:
                this.jitJsonEncoder = RegexpJitJsonEncoder;
                this.isJsonEncodeRequired = true;
                this.isJsonDecodeRequired = true;
                break;
            default:
                this.jitJsonEncoder = noEncoder;
                this.isJsonEncodeRequired = false;
                this.isJsonDecodeRequired = false;
        }
    }
    getJitId(): string {
        return `${this.src.kind}:${String(this.src.literal)}`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        if (typeof this.src.literal === 'symbol') return validateSymbol(varName, this.src.literal);
        else if (this.src.literal instanceof RegExp) return validateRegExp(varName, this.src.literal);
        else if (typeof this.src.literal === 'bigint') return validateBigInt(varName, this.src.literal);
        else return validateLiteral(varName, this.src.literal);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        if (typeof this.src.literal === 'symbol')
            return validateSymbolWithErrors(varName, this.src.literal, this.getName(), pathC);
        else if (this.src.literal instanceof RegExp)
            return validateRegExpWithErrors(varName, this.src.literal, this.getName(), pathC);
        return validateLiteralWithErrors(varName, this.src.literal, this.getName(), pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return this.jitJsonEncoder.encodeToJson(varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return this.jitJsonEncoder.decodeFromJson(varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        return this.jitJsonEncoder.stringify(varName);
    }
    mock(): symbol | string | number | boolean | bigint | RegExp {
        return this.src.literal;
    }
}

const noEncoder: JitJsonEncoder = {
    decodeFromJson() {
        return ``;
    },
    encodeToJson() {
        return ``;
    },
    stringify(varName: string) {
        return `JSON.stringify(${varName})`;
    },
};

function validateBigInt(varName: string, lit: bigint): string {
    return `${varName} === ${toLiteral(lit)}`;
}

function validateSymbol(varName: string, sbl: symbol): string {
    return `(typeof ${varName} === 'symbol' && ${varName}.description === ${toLiteral(sbl.description)})`;
}

function validateRegExp(varName: string, regexp: RegExp): string {
    return `String(${varName}) === String(${regexp})`;
}

function validateLiteral(varName: string, literal: Exclude<TypeLiteral['literal'], symbol>): string {
    return `${varName} === ${toLiteral(literal)}`;
}

function validateSymbolWithErrors(varName: string, sbl: symbol, name: string | number, pathC: string[]): string {
    return `if (typeof ${varName} !== 'symbol' || ${varName}.description !== ${toLiteral(sbl.description)}) {
        ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${toLiteral(name)}})
    }`;
}

function validateRegExpWithErrors(varName: string, regexp: RegExp, name: string | number, pathC: string[]): string {
    return `if (String(${varName}) !== String(${regexp})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${toLiteral(name)}})`;
}

function validateLiteralWithErrors(
    varName: string,
    literal: Exclude<TypeLiteral['literal'], symbol>,
    name: string | number,
    pathC: string[]
): string {
    return `if (${varName} !== ${toLiteral(literal)}) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${toLiteral(name)}})`;
}
