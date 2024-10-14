/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeSymbol} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockContext, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockSymbol} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.symbol,
};

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    src: TypeSymbol = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    getName(): string {
        return 'symbol';
    }
    _compileIsType(cop: JitCompileOp): string {
        return `typeof ${cop.vλl} === 'symbol'`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `if (typeof ${cop.vλl} !== 'symbol') ${cop.args.εrrors}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return SymbolJitJsonEncoder.encodeToJson(cop.vλl);
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return SymbolJitJsonEncoder.decodeFromJson(cop.vλl);
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        return SymbolJitJsonEncoder.stringify(cop.vλl);
    }
    mock(cop?: Pick<MockContext, 'symbolLength' | 'symbolCharSet' | 'symbolName'>): symbol {
        return mockSymbol(cop?.symbolName, cop?.symbolLength, cop?.symbolCharSet);
    }
}

export const SymbolJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = Symbol(${vλl}.substring(7))`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl} =  'Symbol:' + (${vλl}.description || '')`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify('Symbol:' + (${vλl}.description || ''))`;
    },
};
