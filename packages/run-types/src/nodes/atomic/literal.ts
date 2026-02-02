/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeLiteral} from '@deepkit/type';
import type {JitCode, RunType} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {Mutable} from '@mionkit/core';
import {toLiteral} from '../../lib/utils';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {BigIntRunType} from './bigInt';
import {RegexpRunType} from './regexp';
import {SymbolRunType} from './symbol';
import {AnyKindName} from '../../constants.kind';
import {StringRunType} from './string';
import {NumberRunType} from './number';
import {BooleanRunType} from './boolean';

const stringRt = new StringRunType();
const numberRt = new NumberRunType();
const booleanRt = new BooleanRunType();
const symbolRt = new SymbolRunType();
const regexpRt = new RegexpRunType();
const bigIntRt = new BigIntRunType();

type AnyLiteralRunType = StringRunType | NumberRunType | BooleanRunType | SymbolRunType | RegexpRunType | BigIntRunType;

export class LiteralRunType extends AtomicRunType<TypeLiteral> {
    getRunTypeForLiteral(comp: JitFnCompiler): AnyLiteralRunType {
        const noLiterals = comp.opts.noLiterals;
        const lit = this.src.literal;
        let rt: AnyLiteralRunType;
        if (lit instanceof RegExp) {
            rt = regexpRt;
            (rt as Mutable<RunType>).src = this.src;
            if (noLiterals) (this.src as any).kind = ReflectionKind.regexp;
            return rt;
        }
        switch (typeof lit) {
            case 'string':
                rt = stringRt;
                if (noLiterals) (this.src as any).kind = ReflectionKind.string;
                break;
            case 'number':
                rt = numberRt;
                if (noLiterals) (this.src as any).kind = ReflectionKind.number;
                break;
            case 'boolean':
                rt = booleanRt;
                if (noLiterals) (this.src as any).kind = ReflectionKind.boolean;
                break;
            case 'bigint':
                rt = bigIntRt;
                if (noLiterals) (this.src as any).kind = ReflectionKind.bigint;
                break;
            case 'symbol':
                rt = symbolRt;
                if (noLiterals) (this.src as any).kind = ReflectionKind.symbol;
                break;
            default:
                throw new Error(`Unsupported literal type ${typeof lit}`);
        }
        (rt as Mutable<RunType>).src = this.src;
        return rt;
    }
    emitIsType(comp: JitFnCompiler): JitCode {
        if (comp.opts.noLiterals) return this.getRunTypeForLiteral(comp).emitIsType(comp);
        return {code: compileIsLiteral(comp, this.src.literal), type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        if (comp.opts.noLiterals) return this.getRunTypeForLiteral(comp).emitTypeErrors(comp);
        return {code: compileTypeErrorsLiteral(comp, this.src.literal, this.getKindName()), type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return this.getRunTypeForLiteral(comp).emitPrepareForJson(comp);
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return this.getRunTypeForLiteral(comp).emitRestoreFromJson(comp);
    }
    getLiteralValue() {
        return this.src.literal;
    }
}

function compileIsLiteral(comp: JitFnCompiler, lit: TypeLiteral['literal']): string {
    const literalType = typeof lit;
    if (lit instanceof RegExp) return `${comp.vλl} instanceof RegExp && String(${comp.vλl}) === String(${lit})`;
    switch (literalType) {
        case 'string':
            return `${comp.vλl} === ${toLiteral(lit)}`;
        case 'number':
            return `${comp.vλl} === ${toLiteral(lit)}`;
        case 'boolean':
            return `${comp.vλl} === ${toLiteral(lit)}`;
        case 'bigint':
            return `${comp.vλl} === ${toLiteral(lit)}`;
        case 'symbol':
            return `typeof ${comp.vλl} === 'symbol' && ${comp.vλl}.description === ${toLiteral((lit as symbol).description)}`;
        default:
            throw new Error(`Unsupported literal type ${literalType}`);
    }
}

function compileTypeErrorsLiteral(comp: JitErrorsFnCompiler, lit: TypeLiteral['literal'], name: AnyKindName): string {
    const literalType = typeof lit;
    if (lit instanceof RegExp)
        return `if (!(${comp.vλl} instanceof RegExp) || String(${comp.vλl}) !== String(${lit})) ${comp.callJitErr(name)}`;
    switch (literalType) {
        case 'string':
            return `if (${comp.vλl} !== ${toLiteral(lit)}) ${comp.callJitErr(name)}`;
        case 'number':
            return `if (${comp.vλl} !== ${toLiteral(lit)}) ${comp.callJitErr(name)}`;
        case 'boolean':
            return `if (${comp.vλl} !== ${toLiteral(lit)}) ${comp.callJitErr(name)}`;
        case 'bigint':
            return `if (${comp.vλl} !== ${toLiteral(lit)}) ${comp.callJitErr(name)}`;
        case 'symbol':
            return `if (typeof ${comp.vλl} !== 'symbol' || ${comp.vλl}.description !== ${toLiteral((lit as symbol).description)}) {${comp.callJitErr(name)}}`;
        default:
            throw new Error(`Unsupported literal type ${literalType}`);
    }
}
