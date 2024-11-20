/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, JitConstants} from '../types';
import {SymbolJitJsonEncoder} from './symbol';
import {BigIntJitJsonENcoder} from './bigInt';
import {RegexpJitJsonEncoder} from './regexp';
import {getJitErrorPath, memorize, toLiteral} from '../utils';
import {AtomicRunType} from '../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

export class LiteralRunType extends AtomicRunType<TypeLiteral> {
    src: TypeLiteral = null as any; // will be set after construction
    get jitConstants() {
        return this.getJitConstants();
    }
    getJitConstants = memorize((): JitConstants => {
        switch (true) {
            case typeof this.src.literal === 'bigint':
                return getJitConstantsForBigint(this.src.kind, this.src.literal);
            case typeof this.src.literal === 'symbol':
                return getJitConstantsForSymbol(this.src.kind, this.src.literal);
            case this.src.literal instanceof RegExp:
                return getJitConstantsForRegExp(this.src.kind, this.src.literal);
            default:
                return getDefaultJitConstants(this.src.kind, this.src.literal);
        }
    });
    getJsonEncoder() {
        switch (true) {
            case typeof this.src.literal === 'bigint':
                return BigIntJitJsonENcoder;
            case typeof this.src.literal === 'symbol':
                return SymbolJitJsonEncoder;
            case this.src.literal instanceof RegExp:
                return RegexpJitJsonEncoder;
            default:
                return noEncoder;
        }
    }
    _compileIsType(cop: JitCompiler): string {
        if (typeof this.src.literal === 'symbol') return compileIsSymbol(cop, this.src.literal);
        else if (this.src.literal instanceof RegExp) return compileIsRegExp(cop, this.src.literal);
        else if (typeof this.src.literal === 'bigint') return compileIsBigInt(cop, this.src.literal);
        else return compileIsLiteral(cop, this.src.literal);
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        if (typeof this.src.literal === 'symbol') return compileTypeErrorsSymbol(cop, this.src.literal, this.getName());
        else if (this.src.literal instanceof RegExp) return compileTypeErrorsRegExp(cop, this.src.literal, this.getName());
        return compileTypeErrorsLiteral(cop, this.src.literal, this.getName());
    }
    _compileJsonEncode(cop: JitCompiler): string {
        return this.getJsonEncoder().encodeToJson(cop.vλl);
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return this.getJsonEncoder().decodeFromJson(cop.vλl);
    }
    _compileJsonStringify(cop: JitCompiler): string {
        return this.getJsonEncoder().stringify(cop.vλl);
    }
    _mock(): symbol | string | number | boolean | bigint | RegExp {
        return this.src.literal;
    }
}

const noEncoder: JitJsonEncoder = {
    decodeFromJson(vλl): string {
        return vλl;
    },
    encodeToJson(vλl): string {
        return vλl;
    },
    stringify(vλl: string) {
        return `JSON.stringify(${vλl})`;
    },
};

function compileIsBigInt(cop: JitCompiler, lit: bigint): string {
    return `${cop.vλl} === ${toLiteral(lit)}`;
}

function compileIsSymbol(cop: JitCompiler, lit: symbol): string {
    return `(typeof ${cop.vλl} === 'symbol' && ${cop.vλl}.description === ${toLiteral(lit.description)})`;
}

function compileIsRegExp(cop: JitCompiler, lit: RegExp): string {
    return `String(${cop.vλl}) === String(${lit})`;
}

function compileIsLiteral(cop: JitCompiler, lit: Exclude<TypeLiteral['literal'], symbol>): string {
    return `${cop.vλl} === ${toLiteral(lit)}`;
}

function compileTypeErrorsSymbol(cop: JitErrorsCompiler, lit: symbol, name: string | number): string {
    return `if (typeof ${cop.vλl} !== 'symbol' || ${cop.vλl}.description !== ${toLiteral(lit.description)}) {
        utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${toLiteral(name)})
    }`;
}

function compileTypeErrorsRegExp(cop: JitErrorsCompiler, lit: RegExp, name: string | number): string {
    return `if (String(${cop.vλl}) !== String(${lit})) utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${toLiteral(name)})`;
}

function compileTypeErrorsLiteral(
    cop: JitErrorsCompiler,
    lit: Exclude<TypeLiteral['literal'], symbol>,
    name: string | number
): string {
    return `if (${cop.vλl} !== ${toLiteral(lit)}) utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${toLiteral(name)})`;
}

function getJitConstantsForBigint(kind: number, literal: bigint): JitConstants {
    return {
        skipJit: false,
        skipJsonEncode: false,
        skipJsonDecode: false,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getJitConstantsForSymbol(kind: number, literal: symbol): JitConstants {
    return {
        skipJit: true,
        skipJsonEncode: true,
        skipJsonDecode: true,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getJitConstantsForRegExp(kind: number, literal: RegExp): JitConstants {
    return {
        skipJit: false,
        skipJsonEncode: false,
        skipJsonDecode: false,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getDefaultJitConstants(kind: number, literal: string | number | boolean): JitConstants {
    return {
        skipJit: false,
        skipJsonEncode: true,
        skipJsonDecode: true,
        jitId: `${kind}:${literal}`,
    };
}
