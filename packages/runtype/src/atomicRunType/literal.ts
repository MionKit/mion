/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {SymbolJitJsonENcoder} from './symbol';
import {BigIntJitJsonENcoder} from './bigInt';
import {RegexpJitJsonEncoder} from './regexp';
import {getErrorPath, toLiteral} from '../utils';
import {AtomicRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

export class LiteralRunType extends AtomicRunType<TypeLiteral> {
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
    compileIsType(ctx: JitContext): string {
        if (typeof this.src.literal === 'symbol') return validateSymbol(ctx.args.value, this.src.literal);
        else if (this.src.literal instanceof RegExp) return validateRegExp(ctx.args.value, this.src.literal);
        else if (typeof this.src.literal === 'bigint') return validateBigInt(ctx.args.value, this.src.literal);
        else return validateLiteral(ctx.args.value, this.src.literal);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        if (typeof this.src.literal === 'symbol')
            return validateSymbolWithErrors(ctx.args.value, this.src.literal, this.getName(), ctx.path);
        else if (this.src.literal instanceof RegExp)
            return validateRegExpWithErrors(ctx.args.value, this.src.literal, this.getName(), ctx.path);
        return validateLiteralWithErrors(ctx.args.value, this.src.literal, this.getName(), ctx.path);
    }
    compileJsonEncode(ctx: JitContext): string {
        return this.jitJsonEncoder.encodeToJson(ctx.args.value);
    }
    compileJsonDecode(ctx: JitContext): string {
        return this.jitJsonEncoder.decodeFromJson(ctx.args.value);
    }
    compileJsonStringify(ctx: JitContext): string {
        return this.jitJsonEncoder.stringify(ctx.args.value);
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

function validateSymbolWithErrors(varName: string, sbl: symbol, name: string | number, pathC: (string | number)[]): string {
    return `if (typeof ${varName} !== 'symbol' || ${varName}.description !== ${toLiteral(sbl.description)}) {
        ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${toLiteral(name)}})
    }`;
}

function validateRegExpWithErrors(varName: string, regexp: RegExp, name: string | number, pathC: (string | number)[]): string {
    return `if (String(${varName}) !== String(${regexp})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${toLiteral(name)}})`;
}

function validateLiteralWithErrors(
    varName: string,
    literal: Exclude<TypeLiteral['literal'], symbol>,
    name: string | number,
    pathC: (string | number)[]
): string {
    return `if (${varName} !== ${toLiteral(literal)}) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${toLiteral(name)}})`;
}
