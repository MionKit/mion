/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '../../lib/_deepkit/src/reflection/type';
import type {JitSerializer, JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {memorize, toLiteral} from '../../lib/utils';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {bigIntSerializer} from '../../serializers/bigint';
import {regexpSerializer} from '../../serializers/regexp';
import {symbolSerializer} from '../../serializers/symbol';

export class LiteralRunType extends AtomicRunType<TypeLiteral> {
    get jitConstants() {
        return this.getJitConfig();
    }
    getJitConfig = memorize((): JitConfig => {
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
                return bigIntSerializer;
            case typeof this.src.literal === 'symbol':
                return symbolSerializer;
            case this.src.literal instanceof RegExp:
                return regexpSerializer;
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
    _compileJsonEncode(comp: JitCompiler): string | undefined {
        return this.getJsonEncoder().toJsonVal(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler): string | undefined {
        return this.getJsonEncoder().fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return this.getJsonEncoder().stringify(comp.vλl);
    }
    _mock(): symbol | string | number | boolean | bigint | RegExp {
        return this.src.literal;
    }
}

const noEncoder: JitSerializer = {
    fromJsonVal(): undefined {
        return undefined;
    },
    toJsonVal(): undefined {
        return undefined;
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
    return `if (typeof ${comp.vλl} !== 'symbol' || ${comp.vλl}.description !== ${toLiteral(lit.description)}) {${comp.callJitErr(name)}}`;
}

function compileTypeErrorsRegExp(comp: JitErrorsCompiler, lit: RegExp, name: string | number): string {
    return `if (String(${comp.vλl}) !== String(${lit})) ${comp.callJitErr(name)}`;
}

function compileTypeErrorsLiteral(
    comp: JitErrorsCompiler,
    lit: Exclude<TypeLiteral['literal'], symbol>,
    name: string | number
): string {
    return `if (${comp.vλl} !== ${toLiteral(lit)}) ${comp.callJitErr(name)}`;
}

function getJitConstantsForBigint(kind: number, literal: bigint): JitConfig {
    return {
        skipJit: false,
        skipJsonEncode: false,
        skipJsonDecode: false,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getJitConstantsForSymbol(kind: number, literal: symbol): JitConfig {
    return {
        skipJit: true,
        skipJsonEncode: true,
        skipJsonDecode: true,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getJitConstantsForRegExp(kind: number, literal: RegExp): JitConfig {
    return {
        skipJit: false,
        skipJsonEncode: false,
        skipJsonDecode: false,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getDefaultJitConstants(kind: number, literal: string | number | boolean): JitConfig {
    return {
        skipJit: false,
        skipJsonEncode: true,
        skipJsonDecode: true,
        jitId: `${kind}:${literal}`,
    };
}
