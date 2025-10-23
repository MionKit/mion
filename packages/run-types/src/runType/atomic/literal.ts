/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
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
    emitIsType(comp: JitFnCompiler): JitCode {
        if (typeof this.src.literal === 'symbol') return {code: compileIsSymbol(comp, this.src.literal), type: 'E'};
        else if (this.src.literal instanceof RegExp) return {code: compileIsRegExp(comp, this.src.literal), type: 'E'};
        else if (typeof this.src.literal === 'bigint') return {code: compileIsBigInt(comp, this.src.literal), type: 'E'};
        else return {code: compileIsLiteral(comp, this.src.literal), type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        if (typeof this.src.literal === 'symbol')
            return {code: compileTypeErrorsSymbol(comp, this.src.literal, this.getKindName()), type: 'S'};
        else if (this.src.literal instanceof RegExp)
            return {code: compileTypeErrorsRegExp(comp, this.src.literal, this.getKindName()), type: 'S'};
        return {code: compileTypeErrorsLiteral(comp, this.src.literal, this.getKindName()), type: 'S'};
    }
    emitToJsonVal(comp: JitFnCompiler): JitCode {
        return this.getValidator().visitToJsonVal(comp);
    }
    emitFromJsonVal(comp: JitFnCompiler): JitCode {
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

function compileIsBigInt(comp: JitFnCompiler, lit: bigint): string {
    return `${comp.vλl} === ${toLiteral(lit)}`;
}

function compileIsSymbol(comp: JitFnCompiler, lit: symbol): string {
    return `(typeof ${comp.vλl} === 'symbol' && ${comp.vλl}.description === ${toLiteral(lit.description)})`;
}

function compileIsRegExp(comp: JitFnCompiler, lit: RegExp): string {
    return `String(${comp.vλl}) === String(${lit})`;
}

function compileIsLiteral(comp: JitFnCompiler, lit: Exclude<TypeLiteral['literal'], symbol>): string {
    return `${comp.vλl} === ${toLiteral(lit)}`;
}

function compileTypeErrorsSymbol(comp: JitErrorsFnCompiler, lit: symbol, name: AnyKindName): string {
    return `if (typeof ${comp.vλl} !== 'symbol' || ${comp.vλl}.description !== ${toLiteral(lit.description)}) {${comp.callJitErr(name)}}`;
}

function compileTypeErrorsRegExp(comp: JitErrorsFnCompiler, lit: RegExp, name: AnyKindName): string {
    return `if (String(${comp.vλl}) !== String(${lit})) ${comp.callJitErr(name)}`;
}

function compileTypeErrorsLiteral(
    comp: JitErrorsFnCompiler,
    lit: Exclude<TypeLiteral['literal'], symbol>,
    name: AnyKindName
): string {
    return `if (${comp.vλl} !== ${toLiteral(lit)}) ${comp.callJitErr(name)}`;
}
