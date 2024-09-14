/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeLiteral} from '../_deepkit/src/reflection/type';
import type {JitOperation, JitJsonEncoder, JitTypeErrorOperation, JitConstants} from '../types';
import {SymbolJitJsonEncoder} from './symbol';
import {BigIntJitJsonENcoder} from './bigInt';
import {RegexpJitJsonEncoder} from './regexp';
import {getJitErrorPath, memo, toLiteral} from '../utils';
import {AtomicRunType} from '../baseRunTypes';

export class LiteralRunType extends AtomicRunType<TypeLiteral> {
    src: TypeLiteral = null as any; // will be set after construction
    get jitConstants() {
        return this.constants();
    }
    getName(): string {
        return 'literal';
    }
    constants = memo((): JitConstants => {
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
    _compileIsType(stack: JitOperation): string {
        if (typeof this.src.literal === 'symbol') return compileIsSymbol(stack, this.src.literal);
        else if (this.src.literal instanceof RegExp) return compileIsRegExp(stack, this.src.literal);
        else if (typeof this.src.literal === 'bigint') return compileIsBigInt(stack, this.src.literal);
        else return compileIsLiteral(stack, this.src.literal);
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        if (typeof this.src.literal === 'symbol') return compileTypeErrorsSymbol(stack, this.src.literal, this.getName());
        else if (this.src.literal instanceof RegExp) return compileTypeErrorsRegExp(stack, this.src.literal, this.getName());
        return compileTypeErrorsLiteral(stack, this.src.literal, this.getName());
    }
    _compileJsonEncode(stack: JitOperation): string {
        return this.getJsonEncoder().encodeToJson(stack.args.vλl);
    }
    _compileJsonDecode(stack: JitOperation): string {
        return this.getJsonEncoder().decodeFromJson(stack.args.vλl);
    }
    _compileJsonStringify(stack: JitOperation): string {
        return this.getJsonEncoder().stringify(stack.args.vλl);
    }
    mock(): symbol | string | number | boolean | bigint | RegExp {
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

function compileIsBigInt(stack: JitOperation, lit: bigint): string {
    return `${stack.args.vλl} === ${toLiteral(lit)}`;
}

function compileIsSymbol(stack: JitOperation, lit: symbol): string {
    return `(typeof ${stack.args.vλl} === 'symbol' && ${stack.args.vλl}.description === ${toLiteral(lit.description)})`;
}

function compileIsRegExp(stack: JitOperation, lit: RegExp): string {
    return `String(${stack.args.vλl}) === String(${lit})`;
}

function compileIsLiteral(stack: JitOperation, lit: Exclude<TypeLiteral['literal'], symbol>): string {
    return `${stack.args.vλl} === ${toLiteral(lit)}`;
}

function compileTypeErrorsSymbol(stack: JitTypeErrorOperation, lit: symbol, name: string | number): string {
    return `if (typeof ${stack.args.vλl} !== 'symbol' || ${stack.args.vλl}.description !== ${toLiteral(lit.description)}) {
        ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${toLiteral(name)}})
    }`;
}

function compileTypeErrorsRegExp(stack: JitTypeErrorOperation, lit: RegExp, name: string | number): string {
    return `if (String(${stack.args.vλl}) !== String(${lit})) ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${toLiteral(name)}})`;
}

function compileTypeErrorsLiteral(
    stack: JitTypeErrorOperation,
    lit: Exclude<TypeLiteral['literal'], symbol>,
    name: string | number
): string {
    return `if (${stack.args.vλl} !== ${toLiteral(lit)}) ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${toLiteral(name)}})`;
}

function getJitConstantsForBigint(kind: number, literal: bigint): JitConstants {
    return {
        skipJit: false,
        skipJsonEncode: false,
        skipJsonDecode: false,
        isCircularRef: false,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getJitConstantsForSymbol(kind: number, literal: symbol): JitConstants {
    return {
        skipJit: true,
        skipJsonEncode: true,
        skipJsonDecode: true,
        isCircularRef: false,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getJitConstantsForRegExp(kind: number, literal: RegExp): JitConstants {
    return {
        skipJit: false,
        skipJsonEncode: false,
        skipJsonDecode: false,
        isCircularRef: false,
        jitId: `${kind}:${String(literal)}`,
    };
}
function getDefaultJitConstants(kind: number, literal: string | number | boolean): JitConstants {
    return {
        skipJit: false,
        skipJsonEncode: true,
        skipJsonDecode: true,
        isCircularRef: false,
        jitId: `${kind}:${literal}`,
    };
}
