/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '../_deepkit/src/reflection/type';
import type {JitContext, JitJsonEncoder, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {SymbolJitJsonEncoder} from './symbol';
import {BigIntJitJsonENcoder} from './bigInt';
import {RegexpJitJsonEncoder} from './regexp';
import {getJitErrorPath, toLiteral} from '../utils';
import {AtomicRunType} from '../baseRunTypes';

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
                this.jitJsonEncoder = SymbolJitJsonEncoder;
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
        if (typeof this.src.literal === 'symbol') return compileIsSymbol(ctx, this.src.literal);
        else if (this.src.literal instanceof RegExp) return compileIsRegExp(ctx, this.src.literal);
        else if (typeof this.src.literal === 'bigint') return compileIsBigInt(ctx, this.src.literal);
        else return compileIsLiteral(ctx, this.src.literal);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        if (typeof this.src.literal === 'symbol') return compileTypeErrorsSymbol(ctx, this.src.literal, this.getName());
        else if (this.src.literal instanceof RegExp) return compileTypeErrorsRegExp(ctx, this.src.literal, this.getName());
        return compileTypeErrorsLiteral(ctx, this.src.literal, this.getName());
    }
    compileJsonEncode(ctx: JitContext): string {
        return this.jitJsonEncoder.encodeToJson(ctx.args.vλl);
    }
    compileJsonDecode(ctx: JitContext): string {
        return this.jitJsonEncoder.decodeFromJson(ctx.args.vλl);
    }
    compileJsonStringify(ctx: JitContext): string {
        return this.jitJsonEncoder.stringify(ctx.args.vλl);
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
    stringify(vλl: string) {
        return `JSON.stringify(${vλl})`;
    },
};

function compileIsBigInt(ctx: JitContext, lit: bigint): string {
    return `${ctx.args.vλl} === ${toLiteral(lit)}`;
}

function compileIsSymbol(ctx: JitContext, lit: symbol): string {
    return `(typeof ${ctx.args.vλl} === 'symbol' && ${ctx.args.vλl}.description === ${toLiteral(lit.description)})`;
}

function compileIsRegExp(ctx: JitContext, lit: RegExp): string {
    return `String(${ctx.args.vλl}) === String(${lit})`;
}

function compileIsLiteral(ctx: JitContext, lit: Exclude<TypeLiteral['literal'], symbol>): string {
    return `${ctx.args.vλl} === ${toLiteral(lit)}`;
}

function compileTypeErrorsSymbol(ctx: TypeErrorsContext, lit: symbol, name: string | number): string {
    return `if (typeof ${ctx.args.vλl} !== 'symbol' || ${ctx.args.vλl}.description !== ${toLiteral(lit.description)}) {
        ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx)}, expected: ${toLiteral(name)}})
    }`;
}

function compileTypeErrorsRegExp(ctx: TypeErrorsContext, lit: RegExp, name: string | number): string {
    return `if (String(${ctx.args.vλl}) !== String(${lit})) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx)}, expected: ${toLiteral(name)}})`;
}

function compileTypeErrorsLiteral(
    ctx: TypeErrorsContext,
    lit: Exclude<TypeLiteral['literal'], symbol>,
    name: string | number
): string {
    return `if (${ctx.args.vλl} !== ${toLiteral(lit)}) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx)}, expected: ${toLiteral(name)}})`;
}
