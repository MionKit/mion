/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {memorize, toLiteral} from '../../lib/utils';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {bigIntTransformer} from './bigInt';
import {regexpTransformer} from './regexp';
import {symbolTransformer} from './symbol';
import {AnyKindName} from '../../constants.kind';

export class LiteralRunType extends AtomicRunType<TypeLiteral> {
    _getTypeID = memorize(() => `${this.src.kind}:${String(this.src.literal)}`);
    getValidator() {
        switch (true) {
            case typeof this.src.literal === 'bigint':
                return bigIntTransformer;
            case typeof this.src.literal === 'symbol':
                return symbolTransformer;
            case this.src.literal instanceof RegExp:
                return regexpTransformer;
            default:
                return noEncoder;
        }
    }
    visitIsType(comp: JitCompiler): JitCode {
        if (typeof this.src.literal === 'symbol') return {code: compileIsSymbol(comp, this.src.literal), type: 'E'};
        else if (this.src.literal instanceof RegExp) return {code: compileIsRegExp(comp, this.src.literal), type: 'E'};
        else if (typeof this.src.literal === 'bigint') return {code: compileIsBigInt(comp, this.src.literal), type: 'E'};
        else return {code: compileIsLiteral(comp, this.src.literal), type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        if (typeof this.src.literal === 'symbol')
            return {code: compileTypeErrorsSymbol(comp, this.src.literal, this.getKindName()), type: 'S'};
        else if (this.src.literal instanceof RegExp)
            return {code: compileTypeErrorsRegExp(comp, this.src.literal, this.getKindName()), type: 'S'};
        return {code: compileTypeErrorsLiteral(comp, this.src.literal, this.getKindName()), type: 'S'};
    }
    visitToJsonVal(comp: JitCompiler): JitCode {
        return this.getValidator().visitToJsonVal(comp);
    }
    visitFromJsonVal(comp: JitCompiler): JitCode {
        return this.getValidator().visitFromJsonVal(comp);
    }
}

const noEncoder = {
    visitFromJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    },
    visitToJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
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

function compileTypeErrorsSymbol(comp: JitErrorsCompiler, lit: symbol, name: AnyKindName): string {
    return `if (typeof ${comp.vλl} !== 'symbol' || ${comp.vλl}.description !== ${toLiteral(lit.description)}) {${comp.callJitErr(name)}}`;
}

function compileTypeErrorsRegExp(comp: JitErrorsCompiler, lit: RegExp, name: AnyKindName): string {
    return `if (String(${comp.vλl}) !== String(${lit})) ${comp.callJitErr(name)}`;
}

function compileTypeErrorsLiteral(
    comp: JitErrorsCompiler,
    lit: Exclude<TypeLiteral['literal'], symbol>,
    name: AnyKindName
): string {
    return `if (${comp.vλl} !== ${toLiteral(lit)}) ${comp.callJitErr(name)}`;
}
