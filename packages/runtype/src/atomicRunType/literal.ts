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
    _compileIsType(comp: JitCompiler): string {
        if (typeof this.src.literal === 'symbol') return compileIsSymbol(comp, this.src.literal);
        else if (this.src.literal instanceof RegExp) return compileIsRegExp(comp, this.src.literal);
        else if (typeof this.src.literal === 'bigint') return compileIsBigInt(comp, this.src.literal);
        else return compileIsLiteral(comp, this.src.literal);
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        if (typeof this.src.literal === 'symbol') return compileTypeErrorsSymbol(comp, this.src.literal, this.getName());
        else if (this.src.literal instanceof RegExp) return compileTypeErrorsRegExp(comp, this.src.literal, this.getName());
        return compileTypeErrorsLiteral(comp, this.src.literal, this.getName());
    }
    _compileJsonEncode(comp: JitCompiler): string {
        return this.getJsonEncoder().encodeToJson(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler): string {
        return this.getJsonEncoder().decodeFromJson(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return this.getJsonEncoder().stringify(comp.vλl);
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

function compileIsBigInt(comp: JitCompiler, lit: bigint): string {
    return `${comp.vλl} === ${toLiteral(lit)}`;
}

function compileIsSymbol(comp: JitCompiler, lit: symbol): string {
    return `(typeof ${comp.vλl} === 'symbol' && ${comp.vλl}.description === ${toLiteral(lit.description)})`;
}

function compileIsRegExp(comp: JitCompiler, lit: RegExp): string {
    return `String(${comp.vλl}) === String(${lit})`;
}

function compileIsLiteral(comp: JitCompiler, lit: Exclude<TypeLiteral['literal'], symbol>): string {
    return `${comp.vλl} === ${toLiteral(lit)}`;
}

function compileTypeErrorsSymbol(comp: JitErrorsCompiler, lit: symbol, name: string | number): string {
    return `if (typeof ${comp.vλl} !== 'symbol' || ${comp.vλl}.description !== ${toLiteral(lit.description)}) {
        utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${toLiteral(name)})
    }`;
}

function compileTypeErrorsRegExp(comp: JitErrorsCompiler, lit: RegExp, name: string | number): string {
    return `if (String(${comp.vλl}) !== String(${lit})) utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${toLiteral(name)})`;
}

function compileTypeErrorsLiteral(
    comp: JitErrorsCompiler,
    lit: Exclude<TypeLiteral['literal'], symbol>,
    name: string | number
): string {
    return `if (${comp.vλl} !== ${toLiteral(lit)}) utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${toLiteral(name)})`;
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
